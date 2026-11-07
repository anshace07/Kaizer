"""Deterministic safety rules. Plain Python — no AI involved.

check()          -> which rules fire for a transcript + extracted fields
decide_severity() -> final severity and what decided it. A rule hit is always CRITICAL;
                     the LLM's suggestion is only used when no rule fires, so it can never lower a rule.
"""
import re
from functools import lru_cache
from pathlib import Path

import yaml

RULES_FILE = Path(__file__).with_name("safety_rules.yaml")
SEVERITY_ORDER = ["low", "medium", "high", "critical"]
LETTER = r"[\wऀ-ॿ]"  # a word character in Latin or Devanagari


@lru_cache
def load_rules() -> list[dict]:
    return yaml.safe_load(RULES_FILE.read_text(encoding="utf-8"))["rules"]


def contains(text: str, phrase: str) -> bool:
    """True if `phrase` appears in `text` as whole word(s)."""
    pattern = rf"(?<!{LETTER}){re.escape(phrase.lower())}(?!{LETTER})"
    return re.search(pattern, text.lower()) is not None


def check(transcript: str, incident_type: str | None = None, symptoms: list[str] | None = None) -> list[dict]:
    """Run every rule on the RAW transcript, the extracted symptoms and the extracted incident type.

    Returns one hit per rule that fired: {"rule_id", "rule_name", "keyword", "source"}.
    """
    sources = {"transcript": transcript or "", "symptoms": " | ".join(symptoms or [])}
    hits = []
    for rule in load_rules():
        hit = None
        for source, text in sources.items():
            keyword = next((k for k in rule["keywords"] if contains(text, str(k))), None)
            if keyword:
                hit = {"source": source, "keyword": str(keyword)}
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
