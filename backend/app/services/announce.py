"""What PlantPulse says out loud.

Every message has two versions:
- the SCREEN text: Hinglish in Latin script ("Machine 14 par dhuan"), as before;
- the SPOKEN text for Timbre: Hindi words in Devanagari, digits as digits, and the English words the voice
  says well kept in Latin ("Machine 14 पर धुआं"). Romanized Hindi sounds unnatural when spoken.

- acknowledgement_*(): FIXED templates (no LLM) spoken after a report is confirmed.
- spoken_question():   the machine confirmation question, built from the candidates (no LLM).
- handover_summary():  LLM writes both versions of a <=60-word summary of OPEN incidents only, most severe
                       first; checked, and replaced by the template if the LLM fails or breaks the rules.
Spoken text always says "Machine 14", never "M-14".
"""
import json
import re

from .. import llm
from ..models import Incident

MAX_WORDS = 60
SUMMARY_TIMEOUT_SECONDS = 35  # not urgent (a button click), and Gemini has been slow at 20 s
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
DEVANAGARI = re.compile(r"[ऀ-ॿ]")

# Incident type -> short phrase: screen (Latin Hinglish) and spoken (Devanagari Hindi + English)
WHAT = {"smoke": "dhuan", "gas_leak": "gas leak", "sparks_fire": "chingari ya aag", "vibration": "zyada vibration",
        "noise": "ajeeb awaaz", "oil_leak": "oil leak", "overheating": "zyada garmi", "other": "problem"}
WHAT_SPOKEN = {"smoke": "धुआं", "gas_leak": "gas leak", "sparks_fire": "चिंगारी या आग",
               "vibration": "ज़्यादा vibration", "noise": "अजीब आवाज़", "oil_leak": "oil leak",
               "overheating": "ज़्यादा गर्मी", "other": "problem"}

AFTER = {"critical": "Critical alert bhej diya gaya hai.",
         "high": "High priority, supervisor ko bata diya gaya hai.",
         "medium": "Maintenance team ko bata diya gaya hai.",
         "low": "Note kar liya gaya hai."}
AFTER_SPOKEN = {"critical": "Critical alert भेज दिया गया है।",
                "high": "High priority, supervisor को बता दिया गया है।",
                "medium": "Maintenance team को बता दिया गया है।",
                "low": "Note कर लिया गया है।"}


def machine_name(machine_id: str | None, spoken: bool = False) -> str:
    if machine_id:
        return f"Machine {int(machine_id.split('-')[1])}"
    return "Machine पता नहीं" if spoken else "Machine pata nahi"


# ---------- acknowledgement (fixed template) ----------

def acknowledgement_text(inc: Incident) -> str:
    """Screen: 'Report mil gaya. Machine 14 par dhuan — Critical alert bhej diya gaya hai.'"""
    return (f"Report mil gaya. {machine_name(inc.machine_id)} par {WHAT.get(inc.incident_type, 'problem')} — "
            f"{AFTER.get(inc.severity, AFTER['medium'])}")


def acknowledgement_spoken(inc: Incident) -> str:
    """Spoken: 'Report मिल गया। Machine 14 पर धुआं — Critical alert भेज दिया गया है।'"""
    return (f"Report मिल गया। {machine_name(inc.machine_id, True)} पर "
            f"{WHAT_SPOKEN.get(inc.incident_type, 'problem')} — {AFTER_SPOKEN.get(inc.severity, AFTER_SPOKEN['medium'])}")


# ---------- confirmation question (spoken version; the screen keeps the LLM's Hinglish question) ----------

def spoken_question(machine_candidates: list[str]) -> str:
    names = [machine_name(c) for c in machine_candidates]
    if len(names) > 1:
        return f"क्या आपने {' या '.join(names)} कहा?"
    if names:
        return f"क्या आपका मतलब {names[0]} है?"
    return "कौन सी machine है? Machine का number बताइए।"


# ---------- shift handover ----------

def open_incidents(db) -> list[Incident]:
    """Unresolved, not merged, most severe first, newest first within a severity."""
    rows = db.query(Incident).filter(Incident.status != "resolved", Incident.merged_into.is_(None)).all()
    return sorted(rows, key=lambda i: (SEVERITY_RANK.get(i.severity, 9), -i.created_at.timestamp()))


def template_summary(incidents: list[Incident]) -> tuple[str, str]:
    """Fallback (screen, spoken). Repeats are grouped ("— 5 reports") and only WHOLE sentences are dropped
    to stay within the word limit, with a pointer to the on-screen list."""
    if not incidents:
        return ("Abhi koi open incident nahi hai. Shift normal hai.",
                "अभी कोई open incident नहीं है। Shift normal है।")
    groups: dict[tuple, int] = {}  # (machine_id, type, severity) -> count, in severity order (dicts keep order)
    for i in incidents:
        key = (i.machine_id, i.incident_type, i.severity)
        groups[key] = groups.get(key, 0) + 1
    screen = [f"Abhi {len(incidents)} open incidents hain."]
    spoken = [f"अभी {len(incidents)} open incidents हैं।"]
    for (mid, itype, sev), n in groups.items():
        screen.append(f"{machine_name(mid)} par {WHAT.get(itype, 'problem')}, {sev}"
                      + (f" — {n} reports." if n > 1 else "."))
        spoken.append(f"{machine_name(mid, True)} पर {WHAT_SPOKEN.get(itype, 'problem')}, {sev}"
                      + (f" — {n} reports।" if n > 1 else "।"))
    tails = ("Baaki list screen par hai.", "बाकी list screen पर है।")
    for count in range(1, len(screen) + 1):  # keep as many whole sentences as fit
        if len(" ".join(screen[:count] + [tails[0]]).split()) > MAX_WORDS:
            return " ".join(screen[:count - 1] + [tails[0]]), " ".join(spoken[:count - 1] + [tails[1]])
    return " ".join(screen), " ".join(spoken)


SUMMARY_PROMPT = f"""You write a spoken shift-handover summary for a factory supervisor.
Use ONLY the open incidents given. Do not add machines, causes or advice that are not in the data.
Order: most severe first. Short sentences, at most {MAX_WORDS} words. Say "Machine 14", never "M-14".
Return ONLY JSON with two versions of the SAME summary:
{{"summary": "<Hinglish in Latin script, for the screen>",
  "spoken": "<the same sentences for a Hindi voice: Hindi words in Devanagari, numbers as digits, and keep these
             English words in Latin script: Machine, critical, high, medium, low, alert, report, incident, open,
             gas leak, oil leak, vibration>"}}
Example spoken sentence: "Machine 14 पर धुआं, critical।" """


def _mentioned(text: str) -> set[str]:
    return {f"Machine {int(n)}" for n in re.findall(r"Machine\s+0*(\d{1,2})\b", text)}


def handover_summary(db) -> dict:
    """Returns {"text", "spoken", "summary_by", "word_count", "incident_ids", "fallback_reason"}."""
    incidents = open_incidents(db)[:12]  # keep the prompt (and the speech) short
    facts = [{"incident_id": i.id, "machine": machine_name(i.machine_id), "incident_type": i.incident_type,
              "severity": i.severity, "status": i.status, "escalated": bool(i.escalated)} for i in incidents]
    allowed = {f["machine"] for f in facts}
    text = spoken = None
    by, reason = f"llm:{llm.model_name()}", None
    if incidents:
        try:
            data = llm.chat_json([{"role": "system", "content": SUMMARY_PROMPT},
                                  {"role": "user", "content": json.dumps(facts, ensure_ascii=False)}],
                                 timeout=SUMMARY_TIMEOUT_SECONDS, retry_on_timeout=True)
            text, spoken = str(data.get("summary", "")).strip(), str(data.get("spoken", "")).strip()
            if not text or not spoken:
                reason = "LLM returned an empty summary"
            elif len(text.split()) > MAX_WORDS or len(spoken.split()) > MAX_WORDS + 15:
                reason = f"LLM summary too long ({len(text.split())} words)"
            elif not (_mentioned(text) | _mentioned(spoken)) <= allowed:
                reason = f"LLM mentioned machines that are not open: {sorted((_mentioned(text) | _mentioned(spoken)) - allowed)}"
            elif not DEVANAGARI.search(spoken):
                reason = "LLM spoken version was not in Devanagari"
        except llm.LLMError as e:
            reason = f"LLM unavailable ({str(e)[:120]})"
    if text is None or reason:
        (text, spoken), by = template_summary(incidents), "template"
    return {"text": text, "spoken": spoken, "summary_by": by, "word_count": len(text.split()),
            "incident_ids": [i.id for i in incidents], "fallback_reason": reason}
