"""Transcript -> structured incident, using the LLM (with the keyword extractor as fallback).

analyse(transcript, machines) returns everything the Confirm Details screen needs:
  extraction (validated by Pydantic), which extractor ran, any fallback reason,
  safety-rule hits, and the suggested final severity + what decided it.
"""

import json
import re
import time
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .. import keyword_extractor, llm
from ..safety import rules
from .announce import spoken_question


INCIDENT_TYPES = [
    "smoke",
    "gas_leak",
    "sparks_fire",
    "vibration",
    "noise",
    "oil_leak",
    "overheating",
    "other",
]

IncidentType = Literal[
    "smoke",
    "gas_leak",
    "sparks_fire",
    "vibration",
    "noise",
    "oil_leak",
    "overheating",
    "other",
]

Severity = Literal["low", "medium", "high", "critical"]


class Extraction(BaseModel):
    """Structured incident information extracted from a transcript."""

    machine_id: str | None = None
    machine_candidates: list[str] = Field(default_factory=list)
    location: str | None = None
    incident_type: IncidentType = "other"
    reported_symptoms: list[str] = Field(default_factory=list)
    language: Literal["hindi", "english", "hinglish"] = "hinglish"
    suggested_severity: Severity | None = None
    extraction_confidence: float | None = Field(default=None, ge=0, le=1)
    confirmation_required: bool = False
    confirmation_question: str | None = None

    @field_validator("incident_type", mode="before")
    @classmethod
    def unknown_type_is_other(cls, value):
        value = str(value or "other").strip().lower()
        return value if value in INCIDENT_TYPES else "other"

    @field_validator("language", "suggested_severity", mode="before")
    @classmethod
    def lowercase(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


# --------------------------------------------------
# LLM PROMPT
# --------------------------------------------------

SYSTEM_PROMPT = """You turn a factory worker's spoken incident report into JSON.
Reports are in Hindi, English or Hinglish, may mix Devanagari and Latin script,
and come from speech-to-text, so words can be misspelled.

Known machines (id | name | location | spoken aliases):
{machines}

Return ONLY a JSON object with exactly these keys:
- machine_id: one known id if the worker clearly named exactly one machine, else null
- machine_candidates: known ids the worker might mean. Empty if none.
- location: the machine's location, or a place the worker mentioned, else null
- incident_type: one of {types}
- reported_symptoms: short English phrases for what the worker observed
- language: "hindi", "english" or "hinglish"
- suggested_severity: "low", "medium", "high" or "critical"
- extraction_confidence: 0 to 1, how sure you are about machine_id and incident_type
- confirmation_required: true if the machine is missing, not in the list,
  or two machines are plausible.
- confirmation_question: if confirmation_required, ONE short Hinglish question.
  Example: "Kya aapne Machine 14 kaha ya Machine 40?"
  Say "Machine 14", never "M-14".
Never invent a machine id that is not in the list."""


FEW_SHOT = [
    (
        "Machine fourteen main smoke aa roha high, jaldi aao",
        {
            "machine_id": "M-14",
            "machine_candidates": ["M-14"],
            "location": "Utility Block",
            "incident_type": "smoke",
            "reported_symptoms": ["smoke"],
            "language": "hinglish",
            "suggested_severity": "critical",
            "extraction_confidence": 0.9,
            "confirmation_required": False,
            "confirmation_question": None,
        },
    ),
    (
        "मशीन 9 का दरवाज़ा बहुत garam ho gaya hai",
        {
            "machine_id": "M-09",
            "machine_candidates": ["M-09"],
            "location": "Production Unit 2",
            "incident_type": "overheating",
            "reported_symptoms": ["door very hot"],
            "language": "hinglish",
            "suggested_severity": "high",
            "extraction_confidence": 0.9,
            "confirmation_required": False,
            "confirmation_question": None,
        },
    ),
    (
        "press machine ke neeche thoda sa tel tapak raha hai",
        {
            "machine_id": "M-05",
            "machine_candidates": ["M-05"],
            "location": "Production Unit 1",
            "incident_type": "oil_leak",
            "reported_symptoms": ["small oil drip"],
            "language": "hinglish",
            "suggested_severity": "low",
            "extraction_confidence": 0.85,
            "confirmation_required": False,
            "confirmation_question": None,
        },
    ),
    (
        "एलटी पैनल से चिंगारी निकल रही है",
        {
            "machine_id": "M-13",
            "machine_candidates": ["M-13"],
            "location": "Production Unit 3",
            "incident_type": "sparks_fire",
            "reported_symptoms": ["sparks from panel"],
            "language": "hindi",
            "suggested_severity": "critical",
            "extraction_confidence": 0.9,
            "confirmation_required": False,
            "confirmation_question": None,
        },
    ),
    (
        "compressor ya panel ke paas ajeeb si badbu aa rahi hai",
        {
            "machine_id": None,
            "machine_candidates": ["M-01", "M-13"],
            "location": None,
            "incident_type": "gas_leak",
            "reported_symptoms": ["strange smell"],
            "language": "hinglish",
            "suggested_severity": "critical",
            "extraction_confidence": 0.5,
            "confirmation_required": True,
            "confirmation_question": "Badbu compressor (Machine 1) ke paas hai ya panel (Machine 13) ke paas?",
        },
    ),
    (
        "yahan bahut tez khat khat ki awaaz aa rahi hai",
        {
            "machine_id": None,
            "machine_candidates": [],
            "location": None,
            "incident_type": "noise",
            "reported_symptoms": ["loud knocking noise"],
            "language": "hinglish",
            "suggested_severity": "medium",
            "extraction_confidence": 0.4,
            "confirmation_required": True,
            "confirmation_question": "Kaunsi machine se awaaz aa rahi hai? Machine ka number batayiye.",
        },
    ),
]


def build_messages(transcript: str, machines: list[dict]) -> list[dict]:
    machine_lines = "\n".join(
        f"{machine['id']} | {machine['name']} | "
        f"{machine['location']} | "
        f"{', '.join(machine.get('aliases', []))}"
        for machine in machines
    )

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(
                machines=machine_lines,
                types=", ".join(INCIDENT_TYPES),
            ),
        }
    ]

    for text, answer in FEW_SHOT:
        messages.append({"role": "user", "content": text})
        messages.append(
            {
                "role": "assistant",
                "content": json.dumps(answer, ensure_ascii=False),
            }
        )

    messages.append({"role": "user", "content": transcript})

    return messages


# --------------------------------------------------
# MACHINE NORMALIZATION
# --------------------------------------------------

def normalize_id(value, known: dict) -> str | None:
    """Normalize M14, m-14 or M 14 to M-14 if the machine exists."""

    if not value:
        return None

    match = re.fullmatch(
        r"\s*m\s*-?\s*(\d{1,2})\s*",
        str(value),
        re.IGNORECASE,
    )

    machine_id = (
        f"M-{int(match.group(1)):02d}"
        if match
        else str(value)
    )

    return machine_id if machine_id in known else None


def spoken(machine_id: str) -> str:
    """Convert M-14 to Machine 14."""

    return f"Machine {int(machine_id.split('-')[1])}"


NUMBER_ALIASES = {
    14: [
        "fourteen",
        "chaudah",
        "chauda",
        "choudah",
        "chowdah",
        "चौदह",
        "चौदा",
    ],
    40: [
        "forty",
        "chalis",
        "chalees",
        "chaalis",
        "चालीस",
        "चालिस",
    ],
}


def normalize_transcript(text: str) -> str:
    """Normalize Unicode and whitespace without removing Hindi characters."""

    text = unicodedata.normalize("NFKC", text or "")
    text = text.casefold()
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# A bare number followed by one of these is a time/count/measurement, not a machine:
# "5 minute se", "10 baje", "2 baar", "40 degree", "10 बजे", "5 मिनट".
NOT_A_MACHINE_AFTER = (
    r"(?!\s*(?:(?:minutes?|mins?|ghanta|ghante|baje|baar|bar|degrees?|din|"
    r"seconds?|secs?|hours?|log|kg|rpm|"
    # the same words in Devanagari (Prisma codemix writes Hindi words this way)
    r"मिनट|मिनिट|बजे|बार|घंटा|घंटे|डिग्री|दिन|सेकंड|लोग)(?!\w)|%))"
)


def contains_alias(transcript: str, alias: str, bare_number: bool = False) -> bool:
    """Match a complete alias instead of an accidental substring.

    bare_number=True: the alias is just a number ("14", "chalis"), so it only
    counts when it is NOT followed by a unit/time word.
    """

    alias = normalize_transcript(alias)

    if not alias:
        return False

    pattern = r"(?<!\w)" + re.escape(alias) + r"(?!\w)"
    if bare_number:
        pattern += NOT_A_MACHINE_AFTER

    return re.search(pattern, transcript, flags=re.IGNORECASE) is not None


def detect_machine_candidates(
    transcript: str,
    machines: list[dict],
) -> list[str]:
    """
    Deterministically detect machine references.

    Checks machine IDs, numeric IDs, names, configured aliases,
    and common Hindi/English spoken-number variations.
    """

    normalized = normalize_transcript(transcript)
    matched = []

    for machine in machines:
        machine_id = machine["id"]

        number_match = re.search(r"(\d+)", machine_id)
        machine_number = (
            int(number_match.group(1))
            if number_match
            else None
        )

        aliases = set()
        number_words = set()

        aliases.add(machine_id)
        aliases.add(machine_id.replace("-", " "))

        if machine_number is not None:
            number_words.add(str(machine_number))
            number_words.update(NUMBER_ALIASES.get(machine_number, []))

        aliases.add(machine.get("name", ""))
        aliases.update(machine.get("aliases", []))

        aliases -= number_words  # e.g. M-40 also lists bare "chalis"

        found = any(
            contains_alias(normalized, str(alias)) for alias in aliases
        ) or any(
            contains_alias(normalized, word, bare_number=True)
            for word in number_words
        )
        if found:
            matched.append(machine_id)

    return list(dict.fromkeys(matched))


# --------------------------------------------------
# EXTRACTION CLEANUP
# --------------------------------------------------

def tidy(ex: Extraction, machines: list[dict]) -> Extraction:
    """Validate machine IDs and enforce confirmation when necessary."""

    known = {machine["id"]: machine for machine in machines}

    ex.machine_id = normalize_id(ex.machine_id, known)

    candidates = [
        candidate
        for candidate in (
            normalize_id(value, known)
            for value in ex.machine_candidates
        )
        if candidate
    ]

    if ex.machine_id and ex.machine_id not in candidates:
        candidates.insert(0, ex.machine_id)

    ex.machine_candidates = list(dict.fromkeys(candidates))

    if ex.machine_id is None or len(ex.machine_candidates) > 1:
        ex.confirmation_required = True

    if ex.machine_id:
        ex.location = known[ex.machine_id]["location"]

    if ex.confirmation_required and not ex.confirmation_question:
        if len(ex.machine_candidates) > 1:
            names = " ya ".join(
                spoken(candidate)
                for candidate in ex.machine_candidates
            )
            ex.confirmation_question = f"Kya aapne {names} kaha?"
        else:
            ex.confirmation_question = (
                "Kaunsi machine? Machine ka number batayiye."
            )

    if not ex.confirmation_required:
        ex.confirmation_question = None

    return ex


# --------------------------------------------------
# DETERMINISTIC MACHINE SAFETY NET
# --------------------------------------------------

def apply_machine_safety_net(
    ex: Extraction,
    transcript: str,
    machines: list[dict],
) -> Extraction:
    """
    Detect machine aliases independently of Gemini.

    Deterministic transcript detection takes priority over
    an incorrect machine selection made by the LLM.
    """

    detected = detect_machine_candidates(transcript, machines)

    # Multiple explicitly mentioned machines always require confirmation.
    if len(detected) >= 2:
        ex.machine_id = None
        ex.machine_candidates = detected
        ex.confirmation_required = True
        ex.location = None

        names = " ya ".join(spoken(mid) for mid in detected)
        ex.confirmation_question = f"Kya aapne {names} kaha?"

        return ex

    # One explicitly mentioned machine overrides an incorrect LLM choice.
    if len(detected) == 1:
        detected_id = detected[0]

        ex.machine_id = detected_id
        ex.machine_candidates = [detected_id]

        ex.location = next(
            machine["location"]
            for machine in machines
            if machine["id"] == detected_id
        )

        if not ex.confirmation_required:
            ex.confirmation_question = None

        return ex

    # No explicit machine found. tidy() handles missing-machine confirmation.
    return ex


# --------------------------------------------------
# KEYWORD FALLBACK
# --------------------------------------------------

def keyword_fallback(
    transcript: str,
    machines: list[dict],
) -> Extraction:

    result = keyword_extractor.extract(transcript, machines)

    return Extraction(
        machine_id=result["machine_id"],
        machine_candidates=(
            [result["machine_id"]]
            if result["machine_id"]
            else []
        ),
        incident_type=result["incident_type"],
        reported_symptoms=result["symptoms"],
        language=result["language"],
        suggested_severity=result["severity"],
        extraction_confidence=None,
    )


# --------------------------------------------------
# MAIN ANALYSIS
# --------------------------------------------------

def analyse(transcript: str, machines: list[dict]) -> dict:
    """
    LLM extraction or keyword fallback, deterministic machine detection,
    and safety-rule evaluation.

    Safe to call even if the LLM is unavailable.
    """

    started = time.perf_counter()

    fallback_reason = None
    llm_ms = None
    llm_note = None

    try:
        raw = llm.chat_json(build_messages(transcript, machines))

        llm_ms = raw.pop("_llm_ms", None)
        llm_note = raw.pop("_llm_note", None)

        answered_by = (
            raw.pop("_llm_model", None)
            or llm.model_name()
        )

        extraction = Extraction.model_validate(raw)
        extractor = f"llm:{answered_by}"

    except (llm.LLMError, ValidationError) as error:
        fallback_reason = (
            f"LLM unavailable ({str(error).splitlines()[0][:160]}) "
            "— used keyword extractor"
        )

        extraction = keyword_fallback(transcript, machines)
        extractor = "keyword fallback"

    # Normalize and validate the extractor response.
    extraction = tidy(extraction, machines)

    # Independently detect machine references.
    extraction = apply_machine_safety_net(
        extraction,
        transcript,
        machines,
    )

    # Final validation after deterministic detection.
    extraction = tidy(extraction, machines)

    # Safety rules always evaluate the original transcript and extracted fields.
    hits = rules.check(
        transcript,
        extraction.incident_type,
        extraction.reported_symptoms,
    )

    suggested_by = (
        "llm"
        if extractor.startswith("llm")
        else "keyword_fallback"
    )

    severity, decided_by = rules.decide_severity(
        extraction.suggested_severity,
        hits,
        suggested_by,
    )

    return {
        "transcript": transcript,
        "extraction": extraction.model_dump(),
        "extractor": extractor,
        "fallback_reason": fallback_reason,
        "rule_hits": hits,
        "spoken_question": (
            spoken_question(extraction.machine_candidates)
            if extraction.confirmation_required
            else None
        ),
        "severity": severity,
        "severity_decided_by": decided_by,
        "llm_ms": llm_ms,
        "llm_note": llm_note,
        "analyse_ms": round(
            (time.perf_counter() - started) * 1000
        ),
    }