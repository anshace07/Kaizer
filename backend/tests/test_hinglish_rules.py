"""Hinglish stress test for the safety rules: no Gnani, no LLM — just the deterministic rules.

Every danger sentence must fire its rule (100% recall on this set); safe sentences must not fire.
The same sentences are reported in eval/hinglish_text_test.md (eval/run_hinglish_eval.py).
"""
import pytest

from app.safety import rules
from app.text_norm import normalize
from tests.hinglish_cases import DANGER, SAFE


def fired(sentence: str) -> list[str]:
    return [h["rule_id"] for h in rules.check(sentence)]


def test_case_counts():
    assert len(DANGER) >= 80 and len(SAFE) >= 20


@pytest.mark.parametrize("sentence, rule_id, style", DANGER)
def test_danger_sentence_fires(sentence, rule_id, style):
    assert rule_id in fired(sentence), f"{style}: {sentence!r} -> {fired(sentence)}"


@pytest.mark.parametrize("sentence", SAFE)
def test_safe_sentence_does_not_fire(sentence):
    assert fired(sentence) == [], f"false alarm: {sentence!r}"


def test_normaliser_unifies_variants():
    assert normalize("DHUAAN!!") == normalize("dhua") == normalize("dhuwan") == "dhuan"
    assert normalize("धुआँ") == normalize("धुआं") == normalize("धुंआ") == "धुआ"
    assert normalize("आग।") == "आग" and normalize("ज़") == normalize("ज")
    assert normalize("aaag") == "aag" and normalize("aage") != "aag"


def test_keyword_fallback_uses_names_and_devanagari_burning():
    import json
    from app import keyword_extractor
    from app.db import DATA_DIR
    machines = json.loads((DATA_DIR / "machines.json").read_text(encoding="utf-8"))["machines"]
    r = keyword_extractor.extract("पैकेजिंग मशीन से जलने की बदबू आ रही है", machines)
    assert (r["machine_id"], r["incident_type"]) == ("M-12", "smoke")
    assert keyword_extractor.extract("Thermic Fluid Heater bahut garam hai", machines)["machine_id"] == "M-40"
    # bare "gas" is routine talk, not a leak
    assert keyword_extractor.extract("gas cylinder ka order dena hai", machines)["incident_type"] == "other"
