"""Transcript -> structured incident, using the LLM (with the keyword extractor as fallback).

analyse(transcript, machines) returns everything the Confirm Details screen needs:
  extraction (validated by Pydantic), which extractor ran, any fallback reason,
  safety-rule hits, and the suggested final severity + what decided it.
"""
import json
import re
import time
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .. import keyword_extractor, llm
from ..safety import rules

INCIDENT_TYPES = ["smoke", "gas_leak", "sparks_fire", "vibration", "noise", "oil_leak", "overheating", "other"]
IncidentType = Literal["smoke", "gas_leak", "sparks_fire", "vibration", "noise", "oil_leak", "overheating", "other"]
Severity = Literal["low", "medium", "high", "critical"]


class Extraction(BaseModel):
    """What the LLM must return. Anything that doesn't fit is rejected (then we fall back)."""

    machine_id: str | None = None
    machine_candidates: list[str] = []
    location: str | None = None
    incident_type: IncidentType = "other"
    reported_symptoms: list[str] = []
    language: Literal["hindi", "english", "hinglish"] = "hinglish"
    suggested_severity: Severity | None = None
    extraction_confidence: float | None = Field(default=None, ge=0, le=1)  # the model's own guess, not measured
    confirmation_required: bool = False
    confirmation_question: str | None = None

    @field_validator("incident_type", mode="before")
    @classmethod
    def unknown_type_is_other(cls, v):
        v = str(v or "other").strip().lower()
        return v if v in INCIDENT_TYPES else "other"

    @field_validator("language", "suggested_severity", mode="before")
    @classmethod
    def lowercase(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


# ---------- prompt ----------

SYSTEM_PROMPT = """You turn a factory worker's spoken incident report into JSON.
Reports are in Hindi, English or Hinglish, may mix Devanagari and Latin script, and come from
speech-to-text, so words can be misspelled ("main" for "mein", "fourteen" for 14, "high" for "hai").

Known machines (id | name | location | spoken aliases):
{machines}

Return ONLY a JSON object with exactly these keys:
- machine_id: one known id (e.g. "M-14") if the worker clearly named exactly one machine, else null
- machine_candidates: known ids the worker might mean (include machine_id). Empty if none.
- location: the machine's location, or a place the worker mentioned, else null
- incident_type: one of {types}
- reported_symptoms: short English phrases for what the worker observed, e.g. ["smoke", "burning smell"]
- language: "hindi", "english" or "hinglish"
- suggested_severity: "low", "medium", "high" or "critical" (smoke, fire, sparks, gas, injury = critical)
- extraction_confidence: 0 to 1, how sure you are about machine_id and incident_type
- confirmation_required: true if the machine is missing, not in the list, or two machines are plausible
  (e.g. "chaudah" vs "chalis" = 14 vs 40, or "13" vs "30")
- confirmation_question: if confirmation_required, ONE short Hinglish question for the worker, e.g.
  "Kya aapne Machine 14 kaha ya Machine 40?" — say "Machine 14", never "M-14". Else null.
Never invent a machine id that is not in the list."""

# Six worked examples (synthetic). Messy STT spellings on purpose.
FEW_SHOT = [
    ("Machine fourteen main smoke aa roha high, jaldi aao",
     {"machine_id": "M-14", "machine_candidates": ["M-14"], "location": "Utility Block", "incident_type": "smoke",
      "reported_symptoms": ["smoke"], "language": "hinglish", "suggested_severity": "critical",
      "extraction_confidence": 0.9, "confirmation_required": False, "confirmation_question": None}),
    ("मशीन 9 का दरवाज़ा बहुत garam ho gaya hai",
     {"machine_id": "M-09", "machine_candidates": ["M-09"], "location": "Production Unit 2",
      "incident_type": "overheating", "reported_symptoms": ["door very hot"], "language": "hinglish",
      "suggested_severity": "high", "extraction_confidence": 0.9, "confirmation_required": False,
      "confirmation_question": None}),
    ("press machine ke neeche thoda sa tel tapak raha hai",
     {"machine_id": "M-05", "machine_candidates": ["M-05"], "location": "Production Unit 1",
      "incident_type": "oil_leak", "reported_symptoms": ["small oil drip"], "language": "hinglish",
      "suggested_severity": "low", "extraction_confidence": 0.85, "confirmation_required": False,
      "confirmation_question": None}),
    ("एलटी पैनल से चिंगारी निकल रही है",
     {"machine_id": "M-13", "machine_candidates": ["M-13"], "location": "Production Unit 3",
      "incident_type": "sparks_fire", "reported_symptoms": ["sparks from panel"], "language": "hindi",
      "suggested_severity": "critical", "extraction_confidence": 0.9, "confirmation_required": False,
      "confirmation_question": None}),
    ("compressor ya panel ke paas ajeeb si badbu aa rahi hai",
     {"machine_id": None, "machine_candidates": ["M-01", "M-13"], "location": None, "incident_type": "gas_leak",
      "reported_symptoms": ["strange smell"], "language": "hinglish", "suggested_severity": "critical",
      "extraction_confidence": 0.5, "confirmation_required": True,
      "confirmation_question": "Badbu compressor (Machine 1) ke paas hai ya panel (Machine 13) ke paas?"}),
    ("yahan bahut tez khat khat ki awaaz aa rahi hai",
     {"machine_id": None, "machine_candidates": [], "location": None, "incident_type": "noise",
      "reported_symptoms": ["loud knocking noise"], "language": "hinglish", "suggested_severity": "medium",
      "extraction_confidence": 0.4, "confirmation_required": True,
      "confirmation_question": "Kaunsi machine se awaaz aa rahi hai? Machine ka number batayiye."}),
]


def build_messages(transcript: str, machines: list[dict]) -> list[dict]:
    machine_lines = "\n".join(
        f"{m['id']} | {m['name']} | {m['location']} | {', '.join(m['aliases'])}" for m in machines
    )
    messages = [{"role": "system",
                 "content": SYSTEM_PROMPT.format(machines=machine_lines, types=", ".join(INCIDENT_TYPES))}]
    for text, answer in FEW_SHOT:
        messages.append({"role": "user", "content": text})
        messages.append({"role": "assistant", "content": json.dumps(answer, ensure_ascii=False)})
    messages.append({"role": "user", "content": transcript})
    return messages


# ---------- clean-up rules applied to ANY extractor's output ----------

def normalize_id(value, known: dict) -> str | None:
    """'M14', 'm-14', 'M 14' -> 'M-14' if that machine exists, else None."""
    if not value:
        return None
    m = re.fullmatch(r"\s*m\s*-?\s*(\d{1,2})\s*", str(value), re.IGNORECASE)
    mid = f"M-{int(m.group(1)):02d}" if m else str(value)
    return mid if mid in known else None


def spoken(mid: str) -> str:
    return f"Machine {int(mid.split('-')[1])}"  # "M-14" -> "Machine 14" (CLAUDE.md: never say "M-14")


def tidy(ex: Extraction, machines: list[dict]) -> Extraction:
    """Never trust the extractor about machines: keep only known ids and force a question when unsure."""
    known = {m["id"]: m for m in machines}
    ex.machine_id = normalize_id(ex.machine_id, known)
    candidates = [c for c in (normalize_id(c, known) for c in ex.machine_candidates) if c]
    if ex.machine_id and ex.machine_id not in candidates:
        candidates.insert(0, ex.machine_id)
    ex.machine_candidates = list(dict.fromkeys(candidates))  # de-duplicate, keep order

    if ex.machine_id is None or len(ex.machine_candidates) > 1:
        ex.confirmation_required = True  # may only be switched ON here, never off
    if ex.machine_id:
        ex.location = known[ex.machine_id]["location"]
    if ex.confirmation_required and not ex.confirmation_question:
        if len(ex.machine_candidates) > 1:
            names = " ya ".join(spoken(c) for c in ex.machine_candidates)
            ex.confirmation_question = f"Kya aapne {names} kaha?"
        else:
            ex.confirmation_question = "Kaunsi machine? Machine ka number batayiye."
    if not ex.confirmation_required:
        ex.confirmation_question = None
    return ex


def keyword_fallback(transcript: str, machines: list[dict]) -> Extraction:
    kw = keyword_extractor.extract(transcript, machines)
    return Extraction(
        machine_id=kw["machine_id"],
        machine_candidates=[kw["machine_id"]] if kw["machine_id"] else [],
        incident_type=kw["incident_type"],
        reported_symptoms=kw["symptoms"],
        language=kw["language"],
        suggested_severity=kw["severity"],
        extraction_confidence=None,  # keyword matching has no confidence
    )


def analyse(transcript: str, machines: list[dict]) -> dict:
    """LLM extraction (or keyword fallback) + safety rules. Safe to call even if the LLM is down."""
    started = time.perf_counter()
    fallback_reason, llm_ms = None, None
    try:
        raw = llm.chat_json(build_messages(transcript, machines))
        llm_ms = raw.pop("_llm_ms", None)
        extraction = Extraction.model_validate(raw)
        extractor = f"llm:{llm.model_name()}"
    except (llm.LLMError, ValidationError) as e:
        fallback_reason = f"LLM unavailable ({str(e).splitlines()[0][:160]}) — used keyword extractor"
        extraction = keyword_fallback(transcript, machines)
        extractor = "keyword fallback"
    extraction = tidy(extraction, machines)

    # Safety rules run on the RAW transcript AND the extracted fields, after the LLM, every time.
    hits = rules.check(transcript, extraction.incident_type, extraction.reported_symptoms)
    suggested_by = "llm" if extractor.startswith("llm") else "keyword_fallback"
    severity, decided_by = rules.decide_severity(extraction.suggested_severity, hits, suggested_by)

    return {
        "transcript": transcript,
        "extraction": extraction.model_dump(),
        "extractor": extractor,
        "fallback_reason": fallback_reason,
        "rule_hits": hits,
        "severity": severity,
        "severity_decided_by": decided_by,
        "llm_ms": llm_ms,
        "analyse_ms": round((time.perf_counter() - started) * 1000),
    }
