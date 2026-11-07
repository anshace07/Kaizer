"""Rate-limit resilience (Phase 6.3). Everything is faked: no real LLM request is ever made."""
import json

import httpx
import pytest
from openai import RateLimitError

from app import llm
from app.db import DATA_DIR
from app.services import extract

MACHINES = json.loads((DATA_DIR / "machines.json").read_text(encoding="utf-8"))["machines"]
GOOD = {"machine_id": "M-14", "machine_candidates": ["M-14"], "incident_type": "smoke", "reported_symptoms": ["smoke"],
        "language": "hinglish", "suggested_severity": "critical", "extraction_confidence": 0.9,
        "confirmation_required": False, "confirmation_question": None}


def rate_limited(retry_after=None, body=""):
    headers = {"retry-after": retry_after} if retry_after else {}
    response = httpx.Response(429, headers=headers, text=body, request=httpx.Request("POST", "http://llm"))
    return RateLimitError("429 Too Many Requests", response=response, body=None)


class ScriptedClient:
    """Fake OpenAI client: each create() pops the next outcome (an exception to raise, or a reply text)."""

    def __init__(self, outcomes):
        self.outcomes, self.requests = list(outcomes), []
        outer = self

        class Completions:
            def create(self, model, messages, **kwargs):
                outer.requests.append(model)
                outcome = outer.outcomes.pop(0)
                if isinstance(outcome, Exception):
                    raise outcome
                msg = type("M", (), {"content": outcome, "tool_calls": None})
                return type("R", (), {"choices": [type("C", (), {"message": msg})]})
        self.chat = type("Chat", (), {"completions": Completions()})


@pytest.fixture
def llm_env(monkeypatch):
    """Primary + fallback model configured, fresh limiter, and sleeps recorded instead of waited."""
    monkeypatch.setenv("LLM_MODEL", "gemini-3.6-flash")
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "gemini-3.1-flash-lite")
    monkeypatch.setenv("LLM_MAX_RPM", "8")
    monkeypatch.setattr(llm, "_limiter", None)
    sleeps = []
    monkeypatch.setattr(llm.time, "sleep", sleeps.append)

    def use(outcomes):
        client = ScriptedClient(outcomes)
        monkeypatch.setattr(llm, "_client", lambda *args, **kwargs: client)
        return client
    return use, sleeps


# ---------- 429 policy ----------

def test_429_waits_retry_after_then_retries_primary(llm_env):
    use, sleeps = llm_env
    client = use([rate_limited(retry_after="3"), json.dumps({"ok": True})])
    data = llm.chat_json([{"role": "user", "content": "x"}])
    assert client.requests == ["gemini-3.6-flash", "gemini-3.6-flash"]
    assert sleeps == [3.0] and data["_llm_model"] == "gemini-3.6-flash" and "429" in data["_llm_note"]


def test_429_twice_uses_fallback_model_once(llm_env):
    use, sleeps = llm_env
    client = use([rate_limited(), rate_limited(), json.dumps({"ok": True})])
    data = llm.chat_json([{"role": "user", "content": "x"}])
    assert client.requests == ["gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite"]
    assert data["_llm_model"] == "gemini-3.1-flash-lite" and "answered by gemini-3.1-flash-lite" in data["_llm_note"]


def test_429_everywhere_raises_after_three_requests(llm_env):
    use, _ = llm_env
    client = use([rate_limited(), rate_limited(), rate_limited()])
    with pytest.raises(llm.LLMError, match="rate-limited"):
        llm.chat_json([{"role": "user", "content": "x"}])
    assert len(client.requests) == 3  # primary, primary retry, fallback model — then stop


def test_retry_after_is_capped_and_read_from_gemini_body():
    assert llm.retry_after_seconds(rate_limited(retry_after="30")) == 8  # capped
    assert llm.retry_after_seconds(rate_limited(body='{"retryDelay": "3s"}')) == 3
    assert llm.retry_after_seconds(rate_limited()) == llm.DEFAULT_RETRY_AFTER_SECONDS


# ---------- extraction: one call, and the label shows who answered ----------

def test_extraction_is_one_request_and_names_the_answering_model(llm_env):
    use, _ = llm_env
    client = use([rate_limited(), rate_limited(), json.dumps(GOOD)])
    result = extract.analyse("Machine 14 mein dhuan aa raha hai", MACHINES)
    assert result["extractor"] == "llm:gemini-3.1-flash-lite"
    assert "answered by gemini-3.1-flash-lite" in result["llm_note"]
    assert result["severity"] == "critical"


def test_invalid_json_is_not_retried_for_extraction(llm_env):
    use, _ = llm_env
    client = use(["not json"])
    result = extract.analyse("Machine 14 mein dhuan aa raha hai", MACHINES)
    assert len(client.requests) == 1  # no second request
    assert result["extractor"] == "keyword fallback" and result["severity"] == "critical"


def test_total_rate_limit_falls_back_to_keywords_and_rules_still_fire(llm_env):
    use, _ = llm_env
    use([rate_limited(), rate_limited(), rate_limited()])
    result = extract.analyse("Machine 14 mein dhuan aa raha hai", MACHINES)
    assert result["extractor"] == "keyword fallback" and "rate-limited" in result["fallback_reason"]
    assert result["severity"] == "critical" and result["rule_hits"][0]["rule_id"] == "S1"


def test_timeline_records_the_fallback_model(llm_env, client, monkeypatch):
    use, _ = llm_env
    use([rate_limited(), rate_limited(), json.dumps(GOOD)])
    analysis = extract.analyse("Machine 14 mein dhuan aa raha hai", MACHINES)

    def offline(*args, **kwargs):  # the background investigation stays offline in this test
        raise llm.LLMError("no more")
    monkeypatch.setattr(llm, "_client", offline)
    body = client.post("/api/incidents", json={"machine_id": "M-14", "incident_type": "smoke", "severity": "critical",
                                               "transcript": analysis["transcript"], "symptoms": ["smoke"],
                                               "analysis": analysis}).json()
    assert body["extractor"] == "llm:gemini-3.1-flash-lite"
    assert any(e["action"] == "llm_model" and "gemini-3.1-flash-lite" in e["detail"] for e in body["events"])


# ---------- rate limiter ----------

class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


def test_limiter_allows_max_per_minute_then_queues():
    clock = FakeClock()
    limiter = llm.RateLimiter(3, clock=clock, sleep=clock.sleep)
    assert [limiter.acquire() for _ in range(3)] == [0, 0, 0]  # first 3 go straight away
    clock.now = 10
    waited = limiter.acquire(max_wait=60)  # 4th waits until the first one is 60 s old
    assert clock.now == 60 and waited == 50


def test_limiter_gives_up_instead_of_waiting_too_long():
    clock = FakeClock()
    limiter = llm.RateLimiter(2, clock=clock, sleep=clock.sleep)
    limiter.acquire()
    limiter.acquire()
    with pytest.raises(llm.LLMError, match="2 LLM requests/minute"):
        limiter.acquire(max_wait=20)  # would need ~60 s: fail fast -> caller uses its fallback


def test_every_request_goes_through_the_limiter(llm_env, monkeypatch):
    use, _ = llm_env
    acquired = []
    monkeypatch.setattr(llm, "get_limiter", lambda: type("L", (), {"acquire": lambda self: acquired.append(1)})())
    use([rate_limited(), rate_limited(), json.dumps({"ok": True})])
    llm.chat_json([{"role": "user", "content": "x"}])
    assert len(acquired) == 3  # retries and the fallback model also wait their turn
