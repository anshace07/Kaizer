"""Safety layer tests. The real LLM is NEVER called: llm.chat_json is replaced by a fake.

Run from backend/:  .venv\\Scripts\\python -m pytest -q
"""
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import llm
from app.db import DATA_DIR, Base, get_db
from app.safety import rules
from app.services import extract

MACHINES = json.loads((DATA_DIR / "machines.json").read_text(encoding="utf-8"))["machines"]


def fake_llm(monkeypatch, **answer):
    """Make the 'LLM' return `answer` (merged over harmless defaults)."""
    reply = {"machine_id": "M-14", "machine_candidates": ["M-14"], "location": None, "incident_type": "other",
             "reported_symptoms": [], "language": "hinglish", "suggested_severity": "low",
             "extraction_confidence": 0.8, "confirmation_required": False, "confirmation_question": None, **answer}
    monkeypatch.setattr(llm, "chat_json", lambda messages: dict(reply))


# 1 — the headline case
def test_llm_says_low_but_transcript_has_dhuan_stays_critical(monkeypatch):
    fake_llm(monkeypatch, incident_type="other", suggested_severity="low")
    result = extract.analyse("Machine 14 mein dhuan aa raha hai", MACHINES)
    assert result["severity"] == "critical"
    assert result["severity_decided_by"] == "safety_rule"
    assert result["rule_hits"][0]["rule_id"] == "S1"
    assert result["rule_hits"][0]["source"] == "transcript"


# 2-6 — keywords in English, Hinglish and Devanagari
@pytest.mark.parametrize("transcript, rule_id", [
    ("मशीन 14 से धुआं निकल रहा है", "S1"),                # Devanagari smoke
    ("Mixing tank ke paas badbu aa rahi hai", "S2"),     # Hinglish gas smell
    ("LT panel mein chingari dikhi", "S3"),              # Hinglish sparks
    ("Furnace ke peeche aag lag gayi", "S4"),            # Hinglish fire
    ("panel se jalne ki smell aa rahi hai", "S5"),       # Hinglish burning smell
])
def test_keywords_in_every_language_trigger_rules(transcript, rule_id):
    hits = rules.check(transcript)
    assert rule_id in [h["rule_id"] for h in hits]
    assert rules.decide_severity("low", hits) == ("critical", "safety_rule")


# 7 — no rule: the LLM's suggestion is used
def test_no_rule_hit_uses_llm_suggestion(monkeypatch):
    fake_llm(monkeypatch, machine_id="M-06", machine_candidates=["M-06"], incident_type="vibration",
             suggested_severity="medium")
    result = extract.analyse("Conveyor belt thoda vibrate kar raha hai", MACHINES)
    assert result["rule_hits"] == []
    assert (result["severity"], result["severity_decided_by"]) == ("medium", "llm")


# 8 — rules also run on the EXTRACTED fields (STT may mangle the word, the LLM may still catch it)
def test_rule_fires_on_extracted_fields_too(monkeypatch):
    fake_llm(monkeypatch, incident_type="smoke", reported_symptoms=["smoke"], suggested_severity="low")
    result = extract.analyse("Machine fourteen main smog jaisa aa raha", MACHINES)
    assert result["severity"] == "critical"
    assert result["rule_hits"][0]["source"] in ("symptoms", "incident_type")


# 9 — LLM down -> keyword fallback, and the rules still fire
def test_llm_failure_falls_back_and_rules_still_fire(monkeypatch):
    def broken(messages):
        raise llm.LLMError("APITimeoutError after 20.0 s")
    monkeypatch.setattr(llm, "chat_json", broken)
    result = extract.analyse("Machine 14 mein dhuan aa raha hai", MACHINES)
    assert result["extractor"] == "keyword fallback"
    assert "LLM unavailable" in result["fallback_reason"]
    assert result["extraction"]["machine_id"] == "M-14"
    assert result["severity"] == "critical"


# 10 — two plausible machines (14 vs 40) -> must ask the worker; unknown ids are dropped
def test_ambiguous_machine_requires_confirmation(monkeypatch):
    fake_llm(monkeypatch, machine_id=None, machine_candidates=["M-14", "M-40", "M-99"], incident_type="overheating",
             suggested_severity="high", confirmation_required=True,
             confirmation_question="Kya aapne Machine 14 kaha ya Machine 40?")
    ex = extract.analyse("chaudah ya chalis wali machine garam ho rahi hai", MACHINES)["extraction"]
    assert ex["confirmation_required"] is True
    assert ex["machine_candidates"] == ["M-14", "M-40"]  # M-99 is not a known machine -> dropped
    assert "Machine 14" in ex["confirmation_question"]


# 11 — whole words only: "gasket" is not "gas"
def test_whole_word_matching_avoids_false_alarm():
    assert rules.check("Pump ka gasket ghis gaya hai") == []


# 12 — the server re-applies the rules: a worker (or bad client) cannot save "low" for a dhuan report
def test_create_endpoint_cannot_lower_rule_result(monkeypatch):
    from app.main import app
    from app.seed import seed
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)
    with TestSession() as db:
        seed(db)

    def test_db():
        with TestSession() as db:
            yield db
    app.dependency_overrides[get_db] = test_db
    try:
        res = TestClient(app).post("/api/incidents", json={
            "machine_id": "M-14", "incident_type": "other", "severity": "low",
            "transcript": "Machine 14 mein dhuan aa raha hai", "symptoms": []})
    finally:
        app.dependency_overrides.clear()
    body = res.json()
    assert res.status_code == 201
    assert (body["severity"], body["severity_source"], body["escalated"]) == ("critical", "safety_rule", True)
    assert any("Safety rule S1 triggered: dhuan" in e["detail"] for e in body["events"])


# 13 — one retry on invalid JSON, then success
def test_llm_retries_once_on_invalid_json(monkeypatch):
    replies = iter(["not json at all", '```json\n{"ok": true}\n```'])

    class FakeCompletions:
        def create(self, **kwargs):
            msg = type("M", (), {"content": next(replies)})
            return type("R", (), {"choices": [type("C", (), {"message": msg})]})

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})

    monkeypatch.setattr(llm, "_client", lambda: FakeClient())
    monkeypatch.setenv("LLM_MODEL", "fake-model")
    assert llm.chat_json([{"role": "user", "content": "hi"}])["ok"] is True
