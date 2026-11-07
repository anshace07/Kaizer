"""Machine detection + confirmation tests. The real LLM and Gnani are NEVER called.

Run from backend/:  .venv\\Scripts\\python -m pytest -q tests/test_machine_confirmation.py
"""
import pytest

from app.safety import rules
from app.services import extract

from .test_safety import MACHINES, fake_llm


# A bare number followed by a unit/time word ("5 minute", "10 baje") is not a machine.
@pytest.mark.parametrize("transcript, expected", [
    ("chaudah ya chalis wali machine garam ho rahi hai", ["M-14", "M-40"]),
    ("14 ya 40 wali machine garam hai", ["M-14", "M-40"]),
    ("Machine 14 mein 5 minute se dhuan aa raha hai", ["M-14"]),
    ("Machine 7 se 2 baar chingari nikli", ["M-07"]),
    ("Subah 10 baje se machine 3 garam ho rahi hai", ["M-03"]),
    ("Machine 9 ka temperature 40 degree upar chala gaya", ["M-09"]),
    ("मशीन 3 सुबह 10 बजे से गरम है", ["M-03"]),
    ("मशीन 14 में 5 मिनट से धुआं आ रहा है", ["M-14"]),
    ("मशीन 9 बहुत गरम हो रही है", ["M-09"]),
])
def test_detect_machine_candidates_ignores_units(transcript, expected):
    assert extract.detect_machine_candidates(transcript, MACHINES) == expected


def test_keyword_fallback_still_asks_14_or_40():
    # conftest blocks the real LLM, so analyse() uses the keyword fallback
    result = extract.analyse("chaudah ya chalis wali machine garam ho rahi hai", MACHINES)
    ex = result["extraction"]
    assert result["extractor"] == "keyword fallback"
    assert ex["confirmation_required"] is True
    assert ex["machine_candidates"] == ["M-14", "M-40"]


def test_sparks_fire_type_alone_triggers_s3_and_s4(monkeypatch):
    fake_llm(monkeypatch, machine_id="M-13", machine_candidates=["M-13"], incident_type="sparks_fire",
             suggested_severity="low")
    transcript = "panel mein bijli ka jhatka lag raha hai"
    hit_ids = [h["rule_id"] for h in rules.check(transcript, "sparks_fire")]
    assert "S3" in hit_ids and "S4" in hit_ids
    result = extract.analyse(transcript, MACHINES)
    assert result["severity"] == "critical"


def test_create_needs_machine_when_confirmation_required_and_no_rule(client):
    res = client.post("/api/incidents", json={
        "machine_id": None, "incident_type": "overheating", "severity": "medium",
        "transcript": "chaudah ya chalis wali machine garam ho rahi hai", "symptoms": []})
    assert res.status_code == 422
    assert "Machine confirmation is required" in res.json()["detail"]


def test_create_accepts_machine_outside_suggestions(client):
    res = client.post("/api/incidents", json={
        "machine_id": "M-04", "incident_type": "smoke", "severity": "critical",
        "transcript": "Machine 14 mein dhuan aa raha hai", "symptoms": ["smoke"]})
    body = res.json()
    assert res.status_code == 201
    assert body["machine_id"] == "M-04"
    assert any(e["action"] == "worker_override" and e["detail"] == "Worker chose M-04 (suggested: M-14)"
               for e in body["events"])


def test_danger_report_without_machine_is_saved(client):
    res = client.post("/api/incidents", json={
        "machine_id": None, "incident_type": "other", "severity": "low",
        "transcript": "Kuch jalne ki smell aa rahi hai", "symptoms": [],
        "analysis": {"extraction": {"confirmation_required": True, "machine_candidates": []}}})
    body = res.json()
    assert res.status_code == 201
    assert body["machine_id"] is None
    assert (body["severity"], body["escalated"]) == ("critical", True)
    assert any(e["detail"] == "Machine not identified — safety alert raised anyway" for e in body["events"])
