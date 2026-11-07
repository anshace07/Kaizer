"""AI investigation + duplicate tests. The LLM is always faked (see conftest.py)."""
import json
from datetime import date, timedelta

import pytest

from app import llm
from app.agent import investigate, tools
from app.models import Incident


# ---------- a fake OpenAI-style assistant message ----------

class FakeToolCall:
    def __init__(self, i, name, args):
        self.id = f"call_{i}"
        self.function = type("F", (), {"name": name, "arguments": json.dumps(args)})


class FakeMessage:
    def __init__(self, content=None, tool_calls=None):
        self.content, self.tool_calls = content, tool_calls

    def model_dump(self, **kwargs):
        return {"role": "assistant", "content": self.content,
                "tool_calls": [{"id": t.id, "type": "function",
                                "function": {"name": t.function.name, "arguments": t.function.arguments}}
                               for t in self.tool_calls or []]}


SUMMARY = {"findings": ["Machine 14 had a gland leak on 5 Nov.", "Ticket TKT-507 is still open.",
                        "Next service is due on 13 Nov."],
           "recommended_action": "Stop Machine 14 and keep people away from the smoke (SOP-101).",
           "sop_id": "SOP-101", "evidence_missing": []}

ALL_FOUR = [("get_machine_history", {"machine_id": "M-14"}), ("check_open_tickets", {"machine_id": "M-14"}),
            ("get_maintenance_schedule", {"machine_id": "M-14"}), ("search_sop", {"query": "smoke overheating"})]


def fake_chat(replies):
    """chat() that returns the given FakeMessages one by one and records what it was sent."""
    sent = []
    replies = iter(replies)

    def chat(messages, tools=None):
        sent.append({"messages": list(messages), "tools": tools})
        return next(replies), 5
    chat.sent = sent
    return chat


def make_incident(factory, transcript="Machine 14 mein dhuan aa raha hai", severity="critical"):
    with factory() as db:
        db.add(Incident(id="INC-2001", machine_id="M-14", location="Utility Block", incident_type="smoke",
                        symptoms=["smoke"], transcript=transcript, severity=severity, status="open",
                        escalated=True, rule_hits=[]))
        db.commit()
    return "INC-2001"


def load(factory, incident_id):
    with factory() as db:
        inc = db.get(Incident, incident_id)
        return inc.severity, inc.investigation, [(e.action, e.detail) for e in inc.events]


# ---------- tools ----------

def test_tools_return_machine_14_evidence(session_factory):
    with session_factory() as db:
        history = tools.get_machine_history(db, "M-14")
        tickets = tools.check_open_tickets(db, "M-14")
        schedule = tools.get_maintenance_schedule(db, "M-14", today=date(2026, 11, 7))
    assert history["history"][0] == {"date": "2026-11-05", "event_type": "complaint",
                                     "description": "Water leak from gland"}
    assert [t["id"] for t in tickets["open_tickets"]] == ["TKT-507"]
    assert schedule["next_service"] == "2026-11-13" and schedule["days_until_next_service"] == 6
    assert tools.search_sop("smoke")["matches"][0]["id"] == "SOP-101"


def test_run_tool_rejects_unknown_tool_and_machine(session_factory):
    with session_factory() as db:
        with pytest.raises(tools.ToolError):
            tools.run_tool(db, "drop_table", {})
        with pytest.raises(tools.ToolError):
            tools.run_tool(db, "check_open_tickets", {"machine_id": "M-99"})


# ---------- investigation paths ----------

def test_tool_calling_path(monkeypatch, session_factory):
    calls = [FakeToolCall(i, n, a) for i, (n, a) in enumerate(ALL_FOUR)]
    chat = fake_chat([FakeMessage(tool_calls=calls), FakeMessage(content=json.dumps(SUMMARY))])
    monkeypatch.setattr(llm, "chat", chat)
    monkeypatch.setenv("LLM_MODEL", "fake-model")
    iid = make_incident(session_factory)

    investigate.run_investigation(session_factory, iid)

    severity, inv, events = load(session_factory, iid)
    assert inv["status"] == "done" and inv["path"] == "tool_calling"
    assert [c["tool"] for c in inv["tool_calls"]] == [n for n, _ in ALL_FOUR]
    assert inv["sop_id"] == "SOP-101" and "Stop the machine" in inv["sop_section"]["text"]
    assert inv["findings"] == SUMMARY["findings"] and inv["summary_by"] == "llm:fake-model"
    assert sum(a == "tool_call" for a, _ in events) == 4
    assert severity == "critical"  # unchanged
    assert chat.sent[0]["tools"] == tools.TOOL_SPECS  # only our 4 tools were offered


def test_tool_calling_failure_falls_back_to_fixed_order(monkeypatch, session_factory):
    def broken(messages, tools=None):
        raise llm.LLMError("tools not supported")
    monkeypatch.setattr(llm, "chat", broken)
    monkeypatch.setattr(llm, "chat_json", lambda messages: {**SUMMARY, "_llm_ms": 5})
    iid = make_incident(session_factory)

    investigate.run_investigation(session_factory, iid)

    _, inv, events = load(session_factory, iid)
    assert inv["path"] == "fixed_order" and "tools not supported" in inv["fallback_reason"]
    assert [c["tool"] for c in inv["tool_calls"]] == [n for n, _ in ALL_FOUR]
    assert any(a == "investigation_path" for a, _ in events)


def test_no_llm_at_all_uses_template_from_tool_results(session_factory):
    iid = make_incident(session_factory, severity="low")  # conftest blocks every real LLM call

    investigate.run_investigation(session_factory, iid)

    severity, inv, _ = load(session_factory, iid)
    assert inv["status"] == "done" and inv["summary_by"] == "template (LLM unavailable)"
    assert any("TKT-507" in f for f in inv["findings"])
    assert inv["sop_id"] == "SOP-101" and inv["recommended_action"].startswith("Follow SOP-101")
    assert severity == "low"  # the investigation never raises or lowers severity


def test_max_five_tool_calls(monkeypatch, session_factory):
    greedy = [FakeMessage(tool_calls=[FakeToolCall(i, "search_sop", {"query": "smoke"})]) for i in range(5)]
    chat = fake_chat(greedy + [FakeMessage(content=json.dumps(SUMMARY))])
    monkeypatch.setattr(llm, "chat", chat)
    iid = make_incident(session_factory)

    investigate.run_investigation(session_factory, iid)

    _, inv, _ = load(session_factory, iid)
    assert len(inv["tool_calls"]) == 5
    assert chat.sent[-1]["tools"] is None  # after 5 calls the model is no longer offered tools


def test_sop_id_must_come_from_search_results(monkeypatch, session_factory):
    calls = [FakeToolCall(0, "search_sop", {"query": "smoke"})]
    made_up = {**SUMMARY, "sop_id": "SOP-999"}
    monkeypatch.setattr(llm, "chat", fake_chat([FakeMessage(tool_calls=calls), FakeMessage(json.dumps(made_up))]))
    iid = make_incident(session_factory)

    investigate.run_investigation(session_factory, iid)

    _, inv, _ = load(session_factory, iid)
    assert inv["sop_id"] == "SOP-101"
    assert any("SOP-999" in m for m in inv["evidence_missing"])


# ---------- duplicates (through the API; investigation runs with the blocked LLM) ----------

REPORT = {"machine_id": "M-14", "incident_type": "smoke", "severity": "critical", "symptoms": ["smoke"],
          "transcript": "Machine 14 mein dhuan aa raha hai"}


def test_second_report_within_10_min_is_related_not_merged(client):
    first = client.post("/api/incidents", json=REPORT).json()
    second = client.post("/api/incidents", json=REPORT).json()
    assert second["related_incident_id"] == first["id"]
    assert second["duplicate_status"] == "pending" and second["status"] == "open"  # never auto-merged
    assert any(f"Related to {first['id']}" in e["detail"] for e in second["events"])
    # the investigation ran in the background for the new incident
    assert client.get(f"/api/incidents/{second['id']}").json()["investigation"]["status"] == "done"


def test_report_after_10_min_is_not_related(client, session_factory):
    first = client.post("/api/incidents", json=REPORT).json()
    with session_factory() as db:
        db.get(Incident, first["id"]).created_at -= timedelta(minutes=11)
        db.commit()
    assert client.post("/api/incidents", json=REPORT).json()["related_incident_id"] is None


def test_merge_keeps_the_higher_severity(client):
    first = client.post("/api/incidents", json={**REPORT, "incident_type": "overheating", "severity": "medium",
                                                "symptoms": [], "transcript": "Machine 14 garam hai"}).json()
    second = client.post("/api/incidents", json=REPORT).json()  # dhuan -> critical by rule
    merged = client.post(f"/api/incidents/{second['id']}/duplicate", json={"action": "merge"}).json()
    original = client.get(f"/api/incidents/{first['id']}").json()
    assert merged["merged_into"] == first["id"] and merged["status"] == "resolved"
    assert original["severity"] == "critical" and original["escalated"] is True


def test_keep_separate(client):
    client.post("/api/incidents", json=REPORT)
    second = client.post("/api/incidents", json=REPORT).json()
    kept = client.post(f"/api/incidents/{second['id']}/duplicate", json={"action": "keep_separate"}).json()
    assert kept["duplicate_status"] == "kept_separate" and kept["status"] == "open"
