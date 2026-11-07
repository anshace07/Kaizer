"""Keyword-matching extractor — the FALLBACK used when the LLM fails or times out.

Turns a transcript into machine_id / incident_type / severity using simple word lists.
It is deliberately simple; the safety rules still run on its output, so alerts never depend on the LLM.
"""
import re

# Checked in this order: the dangerous types first, so "smoke + noise" counts as smoke.
TYPE_KEYWORDS = {
    "sparks_fire": ["spark", "sparks", "chingari", "चिंगारी", "fire", "aag", "आग", "flame", "short circuit"],
    "smoke": ["smoke", "dhuan", "dhuaan", "dhua", "धुआं", "धुआँ", "धुंआ", "burning smell", "jalne ki"],
    "gas_leak": ["gas", "गैस", "chemical smell", "badbu", "बदबू", "fumes", "solvent smell"],
    "overheating": ["garam", "गरम", "गर्म", "hot", "temperature", "overheat", "overheating"],
    "oil_leak": ["leak", "लीक", "oil", "tel", "तेल", "tapak", "टपक", "coolant"],
    "vibration": ["vibration", "vibrate", "vibrating", "shake", "shaking", "hil", "हिल"],
    "noise": ["awaaz", "aawaz", "आवाज़", "आवाज", "noise", "khat khat", "screech", "screeching"],
}
CRITICAL_TYPES = {"sparks_fire", "smoke", "gas_leak"}
LOW_WORDS = ["thoda", "thodi", "small", "halka", "little", "थोड़ा", "थोड़ी"]
HINGLISH_WORDS = ["hai", "raha", "rahi", "nahi", "se", "ke", "ki", "ka", "mein", "pe", "ho", "aa", "wali"]

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")


def contains(text: str, phrase: str) -> bool:
    """True if `phrase` appears as whole words. Works for Latin and Devanagari script."""
    letter = r"[\wऀ-ॿ]"
    pattern = rf"(?<!{letter}){re.escape(phrase.lower())}(?!{letter})"
    return re.search(pattern, text) is not None


def detect_language(text: str) -> str:
    has_dev, has_latin = bool(DEVANAGARI.search(text)), bool(LATIN.search(text))
    if has_dev and not has_latin:
        return "hindi"
    if has_dev and has_latin:
        return "hinglish"
    if any(contains(text, w) for w in HINGLISH_WORDS):
        return "hinglish"
    return "english"


def find_machine(text: str, machines: list[dict]) -> tuple[str | None, list[str]]:
    """Return the machine id if exactly one machine is mentioned, else None."""
    found, hits = set(), []
    for m in machines:
        for alias in [m["id"]] + m["aliases"]:
            if contains(text, alias):
                found.add(m["id"])
                hits.append(alias)
    return (found.pop() if len(found) == 1 else None), hits


def extract(transcript: str, machines: list[dict]) -> dict:
    text = transcript.lower()
    machine_id, hits = find_machine(text, machines)

    incident_type, symptoms = "other", []
    for itype, words in TYPE_KEYWORDS.items():
        matched = [w for w in words if contains(text, w)]
        if matched:
            symptoms += matched
            if incident_type == "other":
                incident_type = itype

    if incident_type in CRITICAL_TYPES:
        severity = "critical"
    elif any(contains(text, w) for w in LOW_WORDS):
        severity = "low"
    elif incident_type == "overheating":
        severity = "high"
    elif incident_type == "other":
        severity = "low"
    else:
        severity = "medium"

    return {
        "machine_id": machine_id,
        "incident_type": incident_type,
        "severity": severity,
        "symptoms": symptoms,
        "language": detect_language(transcript),
        "matched_keywords": hits + symptoms,
        "extractor": "keyword fallback",
    }
