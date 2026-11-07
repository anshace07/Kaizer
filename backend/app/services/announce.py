"""What PlantPulse says out loud.

- acknowledgement_text(): FIXED template (no LLM) spoken after a report is confirmed.
- handover_summary():     LLM writes a <=60-word Hinglish summary of the OPEN incidents only, ordered by
                          severity; checked, and replaced by a template if the LLM fails or breaks the rules.
Spoken text always says "Machine 14", never "M-14".
"""
import json
import re

from .. import llm
from ..models import Incident

MAX_WORDS = 60
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}

# Incident type -> short Hinglish phrase ("Machine 14 par dhuan")
WHAT = {"smoke": "dhuan", "gas_leak": "gas leak", "sparks_fire": "chingari ya aag", "vibration": "zyada vibration",
        "noise": "ajeeb awaaz", "oil_leak": "oil leak", "overheating": "zyada garmi", "other": "problem"}

AFTER = {"critical": "Critical alert bhej diya gaya hai.",
         "high": "High priority, supervisor ko bata diya gaya hai.",
         "medium": "Maintenance team ko bata diya gaya hai.",
         "low": "Note kar liya gaya hai."}


def machine_name(machine_id: str | None) -> str:
    return f"Machine {int(machine_id.split('-')[1])}" if machine_id else "Machine pata nahi"


def acknowledgement_text(inc: Incident) -> str:
    """e.g. 'Report mil gaya. Machine 14 par dhuan — Critical alert bhej diya gaya hai.'"""
    return (f"Report mil gaya. {machine_name(inc.machine_id)} par {WHAT.get(inc.incident_type, 'problem')} — "
            f"{AFTER.get(inc.severity, AFTER['medium'])}")


def open_incidents(db) -> list[Incident]:
    """Unresolved, not merged, most severe first, newest first within a severity."""
    rows = db.query(Incident).filter(Incident.status != "resolved", Incident.merged_into.is_(None)).all()
    return sorted(rows, key=lambda i: (SEVERITY_RANK.get(i.severity, 9), -i.created_at.timestamp()))


def template_summary(incidents: list[Incident]) -> str:
    """Fallback when the LLM can't be used. Repeats are grouped ("— 5 reports") and only WHOLE sentences
    are dropped to stay within the word limit, with a pointer to the on-screen list."""
    if not incidents:
        return "Abhi koi open incident nahi hai. Shift normal hai."
    groups: dict[tuple, int] = {}  # (machine, what, severity) -> count, in severity order (dicts keep order)
    for i in incidents:
        key = (machine_name(i.machine_id), WHAT.get(i.incident_type, "problem"), i.severity)
        groups[key] = groups.get(key, 0) + 1
    sentences = [f"Abhi {len(incidents)} open incidents hain."]
    sentences += [f"{m} par {w}, {sev}" + (f" — {n} reports." if n > 1 else ".") for (m, w, sev), n in groups.items()]
    tail = "Baaki list screen par hai."
    kept = []
    for sentence in sentences:
        if len(" ".join(kept + [sentence, tail]).split()) > MAX_WORDS:
            return " ".join(kept + [tail])
        kept.append(sentence)
    return " ".join(kept)


SUMMARY_PROMPT = f"""You write a spoken shift-handover summary for a factory supervisor.
Use ONLY the open incidents given. Do not add machines, causes or advice that are not in the data.
Order: most severe first. Hinglish in Latin script, short sentences, at most {MAX_WORDS} words.
Say "Machine 14", never "M-14". Reply with ONLY JSON: {{"summary": "<text>"}}"""


def handover_summary(db) -> dict:
    """Returns {"text", "summary_by", "word_count", "incident_ids", "fallback_reason"}."""
    incidents = open_incidents(db)[:12]  # keep the prompt (and the speech) short
    facts = [{"incident_id": i.id, "machine": machine_name(i.machine_id), "incident_type": i.incident_type,
              "severity": i.severity, "status": i.status, "escalated": bool(i.escalated)} for i in incidents]
    allowed = {f["machine"] for f in facts}
    text, by, reason = None, f"llm:{llm.model_name()}", None
    if incidents:
        try:
            data = llm.chat_json([{"role": "system", "content": SUMMARY_PROMPT},
                                  {"role": "user", "content": json.dumps(facts, ensure_ascii=False)}])
            text = str(data.get("summary", "")).strip()
            mentioned = {f"Machine {int(n)}" for n in re.findall(r"Machine\s+0*(\d{1,2})\b", text)}
            if not text:
                reason = "LLM returned an empty summary"
            elif len(text.split()) > MAX_WORDS:
                reason = f"LLM summary had {len(text.split())} words (> {MAX_WORDS})"
            elif not mentioned <= allowed:
                reason = f"LLM mentioned machines that are not open: {sorted(mentioned - allowed)}"
        except llm.LLMError as e:
            reason = f"LLM unavailable ({str(e)[:120]})"
    if text is None or reason:
        text, by = template_summary(incidents), "template"
    return {"text": text, "summary_by": by, "word_count": len(text.split()),
            "incident_ids": [i.id for i in incidents], "fallback_reason": reason}
