"""Deterministic safety rules. Plain Python — no AI involved.

check()          -> which rules fire for a transcript + extracted fields
decide_severity() -> final severity and what decided it. A rule hit is always CRITICAL;
                     the LLM's suggestion is only used when no rule fires, so it can never lower a rule.
"""
from functools import lru_cache
from pathlib import Path

import yaml

from ..text_norm import has_phrase, normalize

RULES_FILE = Path(__file__).with_name("safety_rules.yaml")
SEVERITY_ORDER = ["low", "medium", "high", "critical"]


@lru_cache
def load_rules() -> list[dict]:
    """Rules from the YAML file, with every keyword and exception already normalised."""
    rules = yaml.safe_load(RULES_FILE.read_text(encoding="utf-8"))["rules"]
    for rule in rules:
        rule["patterns"] = [(str(k), normalize(str(k))) for k in rule["keywords"]]
        rule["exceptions"] = [normalize(str(e)) for e in rule.get("except", [])]
    return rules


def contains(text: str, phrase: str) -> bool:
    """True if `phrase` appears in `text` as whole word(s), after normalising both."""
    return has_phrase(normalize(text), normalize(phrase))


def _without(normalized_text: str, exceptions: list[str]) -> str:
    """Remove harmless compound nouns (e.g. "fire extinguisher") before matching."""
    padded = f" {normalized_text} "
    for exc in exceptions:
        padded = padded.replace(f" {exc} ", " | ")
    return padded.strip()


def check(transcript: str, incident_type: str | None = None, symptoms: list[str] | None = None) -> list[dict]:
    """Run every rule on the RAW transcript, the extracted symptoms and the extracted incident type.

    Returns one hit per rule that fired: {"rule_id", "rule_name", "keyword", "source"}.
    """
    sources = {"transcript": normalize(transcript), "symptoms": normalize(" | ".join(symptoms or []))}
    hits = []
    for rule in load_rules():
        hit = None
        for source, text in sources.items():
            text = _without(text, rule["exceptions"])
            keyword = next((original for original, norm in rule["patterns"] if has_phrase(text, norm)), None)
            if keyword:
                hit = {"source": source, "keyword": keyword}
                break
        if hit is None and incident_type and incident_type in rule.get("incident_types", []):
            hit = {"source": "incident_type", "keyword": incident_type}
        if hit:
            hits.append({"rule_id": rule["id"], "rule_name": rule["name"], **hit})
    return hits


def decide_severity(suggested: str | None, hits: list[dict], suggested_by: str = "llm") -> tuple[str, str]:
    """Return (severity, decided_by).

    - any rule hit        -> ("critical", "safety_rule")  — nothing can lower this
    - otherwise           -> the suggestion (LLM, keyword fallback or worker), default "medium"
    """
    if hits:
        return "critical", "safety_rule"
    if suggested in SEVERITY_ORDER:
        return suggested, suggested_by
    return "medium", "default"
