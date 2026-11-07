"""AI investigation of one incident, run in the background right after the incident is created.

1. Gather evidence with the 4 tools in tools.py:
   - path "tool_calling": the LLM picks tools via OpenAI-style function calling (max 5 calls), or
   - path "fixed_order": if tool calling fails/unsupported, we call all 4 tools ourselves in a fixed order.
2. Summarise: the LLM writes 3 findings + 1 recommended action + the SOP id, using ONLY the tool results.
   If that fails too, a plain template builds the summary from the same results.

Every tool call becomes a timeline event (tool, args, result summary, ms). The investigation stores
its result in incident.investigation and NEVER changes severity — that belongs to the safety rules.
"""
import json
import time
from datetime import datetime, timezone

from pydantic import BaseModel, ValidationError

from .. import llm
from ..models import Incident, IncidentEvent
from . import tools

MAX_TOOL_CALLS = 5

# Fixed-order path: English words for the SOP search, per incident type.
SOP_QUERY = {"smoke": "smoke overheating burning smell", "gas_leak": "gas leak chemical smell",
             "sparks_fire": "sparks fire electrical", "vibration": "abnormal vibration noise",
             "noise": "abnormal vibration noise", "oil_leak": "oil fluid leak",
             "overheating": "high temperature overheating", "other": "warning signs"}

SYSTEM_PROMPT = """You investigate a factory incident for the shift supervisor.
Use the tools to collect evidence about the machine and the right safety-manual (SOP) section.
Call all the tools you need in ONE turn if you can; you may make at most 5 tool calls in total.
Use only the tool results — never invent history, tickets, dates or SOP text.
When you have the evidence, reply with ONLY this JSON (no tools):
{"findings": ["<finding 1>", "<finding 2>", "<finding 3>"],
 "recommended_action": "<one short action>",
 "sop_id": "<SOP id from search_sop results, or null>",
 "evidence_missing": ["<what you could not find, if anything>"]}
Keep each finding under 25 words. Write "Machine 14", not "M-14". If evidence is missing, say so."""


class Summary(BaseModel):
    findings: list[str]
    recommended_action: str
    sop_id: str | None = None
    evidence_missing: list[str] = []


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def brief(inc: Incident) -> dict:
    """What the LLM is told about the incident (no database access)."""
    return {"incident_id": inc.id, "machine_id": inc.machine_id, "location": inc.location,
            "incident_type": inc.incident_type, "symptoms": inc.symptoms, "transcript": inc.transcript,
            "severity": inc.severity}


class Investigation:
    """Holds the state of one run and writes progress to the database as it goes."""

    def __init__(self, db, inc: Incident):
        self.db, self.inc = db, inc
        self.calls: list[dict] = []  # trace: tool, args, summary, ms, ok
        self.results: list[dict] = []  # full tool results, used for the summary and the UI
        self.data = {"status": "running", "started_at": now_iso(), "tool_calls": self.calls, "llm_calls": 0}
        self.save("investigation_started", "AI investigation started")

    def save(self, action: str | None = None, detail: str = ""):
        if action:
            self.inc.events.append(IncidentEvent(action=action, detail=detail))
        self.inc.investigation = {**self.data, "evidence": self.results}  # new dict so SQLAlchemy saves it
        self.db.commit()

    def call_tool(self, name: str, args: dict) -> dict:
        started = time.perf_counter()
        try:
            result, ok = tools.run_tool(self.db, name, args, incident_id=self.inc.id), True
            summary = tools.summarize(name, result)
        except tools.ToolError as e:
            result, ok, summary = {"error": str(e)}, False, f"error: {e}"
        ms = round((time.perf_counter() - started) * 1000, 1)
        self.calls.append({"tool": name, "args": args, "summary": summary, "ms": ms, "ok": ok})
        if ok:
            self.results.append({"tool": name, "args": args, "result": result})
        arg_text = ", ".join(f"{k}={v}" for k, v in args.items())
        self.save("tool_call", f"{name}({arg_text}) → {summary} · {ms} ms")
        return result


def gather_with_tool_calling(inv: Investigation) -> str | None:
    """Let the LLM choose tools. Returns the LLM's final text (hopefully the summary JSON)."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(brief(inv.inc), ensure_ascii=False)}]
    while True:
        allow_tools = len(inv.calls) < MAX_TOOL_CALLS
        inv.data["llm_calls"] += 1
        message, _ = llm.chat(messages, tools=tools.TOOL_SPECS if allow_tools else None)
        if not message.tool_calls:
            if not inv.calls:
                raise llm.LLMError("the model answered without calling any tool")
            return message.content
        # Send the assistant turn back exactly as received (Gemini needs its hidden "thought" fields).
        messages.append(message.model_dump(exclude_none=True))
        for tc in message.tool_calls:
            if len(inv.calls) >= MAX_TOOL_CALLS:
                result = {"error": f"limit of {MAX_TOOL_CALLS} tool calls reached"}
            else:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except ValueError:
                    args = {}
                result = inv.call_tool(tc.function.name, args)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, ensure_ascii=False)})


def gather_fixed_order(inv: Investigation):
    """Fallback: call all 4 tools ourselves, always in the same order."""
    mid = inv.inc.machine_id
    if mid:
        inv.call_tool("get_machine_history", {"machine_id": mid})
        inv.call_tool("check_open_tickets", {"machine_id": mid})
        inv.call_tool("get_maintenance_schedule", {"machine_id": mid})
    query = " ".join([SOP_QUERY.get(inv.inc.incident_type, ""), *inv.inc.symptoms]).strip() or "warning signs"
    inv.call_tool("search_sop", {"query": query})


def sop_ids_found(inv: Investigation) -> list[str]:
    return [m["id"] for r in inv.results if r["tool"] == "search_sop" for m in r["result"]["matches"]]


def template_summary(inv: Investigation) -> Summary:
    """No LLM: build the summary straight from the tool results."""
    by_tool = {r["tool"]: r["result"] for r in inv.results}
    findings, missing = [], []
    if h := by_tool.get("get_machine_history"):
        latest = h["history"][0] if h["history"] else None
        findings.append(f"{len(h['history'])} past events on record" +
                        (f"; latest {latest['date']}: {latest['description']}." if latest else "."))
    else:
        missing.append("machine history")
    if t := by_tool.get("check_open_tickets"):
        findings.append("Open tickets: " + ("; ".join(f"{x['id']} {x['title']}" for x in t["open_tickets"]) or "none") + ".")
    else:
        missing.append("open tickets")
    if m := by_tool.get("get_maintenance_schedule"):
        findings.append(f"Next service {m['next_service']} ({m['days_until_next_service']} days away).")
    else:
        missing.append("maintenance schedule")
    sop = by_tool.get("search_sop", {}).get("matches", [])
    action = "Inform the Shift Supervisor and follow the safety manual."
    if sop:
        first_step = next((line.split(". ", 1)[1] for line in sop[0]["text"].splitlines() if line[:2] == "1."), "")
        action = f"Follow {sop[0]['id']}: {first_step}" if first_step else f"Follow {sop[0]['id']}."
    else:
        missing.append("matching SOP section")
    return Summary(findings=findings[:3], recommended_action=action, sop_id=sop[0]["id"] if sop else None,
                   evidence_missing=missing)


def summarise(inv: Investigation, llm_text: str | None) -> tuple[Summary, str]:
    """Parse the LLM's summary (asking once more if needed), else use the template. Returns (summary, by)."""
    try:
        if llm_text:
            try:
                return Summary.model_validate(llm.parse_json(llm_text)), f"llm:{llm.model_name()}"
            except (ValueError, ValidationError):
                pass
        evidence = json.dumps({"incident": brief(inv.inc), "tool_results": inv.results}, ensure_ascii=False)
        inv.data["llm_calls"] += 1
        data = llm.chat_json([{"role": "system", "content": SYSTEM_PROMPT},
                              {"role": "user", "content": "Evidence (tool results only):\n" + evidence}])
        data.pop("_llm_ms", None)
        return Summary.model_validate(data), f"llm:{llm.model_name()}"
    except (llm.LLMError, ValidationError) as e:
        inv.data["summary_fallback_reason"] = str(e).splitlines()[0][:160]
        return template_summary(inv), "template (LLM unavailable)"


def run_investigation(session_factory, incident_id: str):
    """Entry point for the background task. Opens its own DB session."""
    started = time.perf_counter()
    with session_factory() as db:
        inc = db.get(Incident, incident_id)
        if inc is None:
            return
        inv = Investigation(db, inc)  # note: nothing here ever writes inc.severity (tested)
        try:
            try:
                llm_text = gather_with_tool_calling(inv)
                inv.data["path"] = "tool_calling"
            except llm.LLMError as e:
                inv.data["path"] = "fixed_order"
                inv.data["fallback_reason"] = str(e).splitlines()[0][:160]
                inv.save("investigation_path", f"Tool calling unavailable ({inv.data['fallback_reason']}) "
                                               "— calling all 4 tools in fixed order")
                llm_text = None
                inv.calls.clear()
                inv.results.clear()
                gather_fixed_order(inv)

            summary, summary_by = summarise(inv, llm_text)
            found = sop_ids_found(inv)
            if summary.sop_id not in found:  # the SOP id must come from the search results
                if summary.sop_id:
                    summary.evidence_missing.append(f"{summary.sop_id} was not in the SOP search results")
                summary.sop_id = found[0] if found else None
            sop = next((m for r in inv.results if r["tool"] == "search_sop" for m in r["result"]["matches"]
                        if m["id"] == summary.sop_id), None)

            inv.data.update({
                "status": "done", "summary_by": summary_by, "findings": summary.findings[:3],
                "recommended_action": summary.recommended_action, "sop_id": summary.sop_id, "sop_section": sop,
                "evidence_missing": summary.evidence_missing, "finished_at": now_iso(),
                "total_ms": round((time.perf_counter() - started) * 1000),
            })
            path = "LLM tool calling" if inv.data["path"] == "tool_calling" else "fixed order"
            inv.save("investigation_done", f"Investigation done via {path} · {len(inv.calls)} tool calls · "
                                           f"summary by {summary_by} · SOP {summary.sop_id or 'none'} · "
                                           f"{inv.data['total_ms']} ms")
        except Exception as e:  # never leave the page stuck on "Investigating…"
            db.rollback()
            inv.data.update({"status": "failed", "error": f"{type(e).__name__}: {e}"[:200], "finished_at": now_iso()})
            inv.save("investigation_failed", inv.data["error"])
