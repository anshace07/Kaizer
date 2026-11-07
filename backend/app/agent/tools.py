"""The ONLY four things the investigating LLM is allowed to look at.

Each tool is a plain, tested Python function that reads our synthetic data and returns a small dict.
The LLM never gets database access: it can only ask for one of these tools by name, and run_tool()
checks the name and arguments before anything runs.
"""
import json
import re
from datetime import date
from functools import lru_cache

from sqlalchemy.orm import Session

from ..db import DATA_DIR
from ..models import Incident, Machine, Ticket


class ToolError(Exception):
    """Bad tool name or arguments (e.g. an unknown machine)."""


def _load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def _check_machine(db: Session, machine_id) -> Machine:
    machine = db.get(Machine, str(machine_id)) if machine_id else None
    if machine is None:
        raise ToolError(f"Unknown machine_id {machine_id!r}")
    return machine


def get_machine_history(db: Session, machine_id: str, exclude_incident_id: str | None = None) -> dict:
    """Past maintenance/complaint/breakdown events (history.json) + earlier incidents in our database."""
    _check_machine(db, machine_id)
    events = sorted((e for e in _load("history.json")["history"] if e["machine_id"] == machine_id),
                    key=lambda e: e["date"], reverse=True)
    incidents = (db.query(Incident).filter(Incident.machine_id == machine_id, Incident.id != exclude_incident_id)
                 .order_by(Incident.created_at.desc()).limit(5).all())
    return {
        "machine_id": machine_id,
        "history": [{k: e[k] for k in ("date", "event_type", "description")} for e in events[:8]],
        "past_incidents": [{"id": i.id, "date": i.created_at.date().isoformat(), "incident_type": i.incident_type,
                            "severity": i.severity, "status": i.status} for i in incidents],
    }


def check_open_tickets(db: Session, machine_id: str) -> dict:
    """Maintenance tickets for this machine that are not closed."""
    _check_machine(db, machine_id)
    tickets = db.query(Ticket).filter(Ticket.machine_id == machine_id, Ticket.status != "closed").all()
    return {
        "machine_id": machine_id,
        "open_tickets": [{"id": t.id, "title": t.title, "priority": t.priority, "status": t.status,
                          "opened_on": t.opened_on, "assigned_team": t.assigned_team} for t in tickets],
    }


def get_maintenance_schedule(db: Session, machine_id: str, today: date | None = None) -> dict:
    """Last and next service dates, and how many days until the next one (negative = overdue)."""
    machine = _check_machine(db, machine_id)
    row = next((r for r in _load("maintenance.json")["maintenance"] if r["machine_id"] == machine_id), {})
    next_service = machine.next_service_date or row.get("next_service")
    days = (date.fromisoformat(next_service) - (today or date.today())).days if next_service else None
    return {"machine_id": machine_id, "last_service": row.get("last_service"), "next_service": next_service,
            "days_until_next_service": days}


# ---------- SOP search ----------

STOPWORDS = {"the", "and", "for", "from", "with", "not", "are", "any", "you", "this", "that", "use", "out", "off"}


@lru_cache
def sop_sections() -> list[dict]:
    """Split data/sop.md into sections that start with '## SOP-1xx Title'."""
    text = (DATA_DIR / "sop.md").read_text(encoding="utf-8")
    parts = re.split(r"^## (SOP-\d+)\s+(.+)$", text, flags=re.MULTILINE)
    # re.split gives [preamble, id, title, body, id, title, body, ...]
    return [{"id": parts[i], "title": parts[i + 1].strip(), "text": parts[i + 2].strip().rstrip("-").strip()}
            for i in range(1, len(parts), 3)]


def _words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2 and w not in STOPWORDS]


def search_sop(query: str, limit: int = 2) -> dict:
    """Keyword search over the safety manual. A word in the title counts 3x, in the body 1x."""
    words = set(_words(query or ""))
    if not words:
        raise ToolError("search_sop needs a query with at least one real word")
    scored = []
    for s in sop_sections():
        title, body = set(_words(s["title"])), _words(s["text"])
        score = sum(3 * (w in title) + body.count(w) for w in words)
        if score:
            scored.append((score, s))
    scored.sort(key=lambda pair: -pair[0])
    return {"query": query, "matches": [{"id": s["id"], "title": s["title"], "text": s["text"], "score": score}
                                        for score, s in scored[:limit]]}


# ---------- what the LLM sees, and the only way it can run something ----------

_MACHINE_ARG = {"type": "object", "properties": {"machine_id": {"type": "string", "description": "e.g. M-14"}},
                "required": ["machine_id"]}

TOOL_SPECS = [
    {"type": "function", "function": {"name": "get_machine_history", "parameters": _MACHINE_ARG,
                                      "description": "Past maintenance, complaints, breakdowns and earlier incidents for one machine."}},
    {"type": "function", "function": {"name": "check_open_tickets", "parameters": _MACHINE_ARG,
                                      "description": "Open maintenance tickets for one machine."}},
    {"type": "function", "function": {"name": "get_maintenance_schedule", "parameters": _MACHINE_ARG,
                                      "description": "Last/next service date and days until next service for one machine."}},
    {"type": "function", "function": {
        "name": "search_sop",
        "description": "Search the plant safety manual (SOP sections). Use English words like 'smoke overheating'.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
]
TOOL_NAMES = [spec["function"]["name"] for spec in TOOL_SPECS]


def run_tool(db: Session, name: str, args: dict, incident_id: str | None = None) -> dict:
    """Run one allowed tool with checked arguments. Anything else raises ToolError."""
    if not isinstance(args, dict):
        raise ToolError("arguments must be a JSON object")
    if name == "search_sop":
        return search_sop(str(args.get("query", "")))
    if name == "get_machine_history":
        return get_machine_history(db, args.get("machine_id"), exclude_incident_id=incident_id)
    if name == "check_open_tickets":
        return check_open_tickets(db, args.get("machine_id"))
    if name == "get_maintenance_schedule":
        return get_maintenance_schedule(db, args.get("machine_id"))
    raise ToolError(f"Tool {name!r} is not allowed")


def summarize(name: str, result: dict) -> str:
    """One short line per tool result, for the timeline."""
    if name == "get_machine_history":
        return f"{len(result['history'])} history events, {len(result['past_incidents'])} earlier incidents"
    if name == "check_open_tickets":
        ids = ", ".join(t["id"] for t in result["open_tickets"]) or "none"
        return f"{len(result['open_tickets'])} open tickets ({ids})"
    if name == "get_maintenance_schedule":
        return f"next service {result['next_service']} ({result['days_until_next_service']} days)"
    if name == "search_sop":
        return "matches: " + (", ".join(f"{m['id']} {m['title']}" for m in result["matches"]) or "none")
    return "ok"
