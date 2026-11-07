"""OpenAI-compatible LLM client, configured ONLY by env vars (backend/.env):

    LLM_BASE_URL, LLM_MODEL, LLM_API_KEY                       (required)
    LLM_FALLBACK_MODEL   second model tried once if LLM_MODEL stays rate-limited (e.g. gemini-3.1-flash-lite)
    LLM_MAX_RPM          max requests per minute this app sends (default 8); extra requests wait briefly
    LLM_REASONING_EFFORT optional thinking effort

Swapping providers needs zero code changes. The API key is never printed or logged.

Every HTTP request goes through _complete():
  rate limiter -> LLM_MODEL
  on HTTP 429: wait Retry-After (max 8 s) -> retry LLM_MODEL once -> LLM_FALLBACK_MODEL once -> LLMError
Callers turn LLMError into their own fallback (keyword extractor, fixed-order tools, template summary).
"""
import json
import logging
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass

from openai import APITimeoutError, OpenAI, RateLimitError

TIMEOUT_SECONDS = 20
MAX_RETRY_AFTER_SECONDS = 8
DEFAULT_RETRY_AFTER_SECONDS = 2  # when the 429 response doesn't say how long to wait
DEFAULT_MAX_RPM = 8
MAX_QUEUE_SECONDS = 20  # longest a request waits for the limiter before giving up (-> fallback)

log = logging.getLogger("uvicorn.error")  # shows up in the uvicorn terminal


class LLMError(Exception):
    """The LLM is not configured, failed, timed out, was rate-limited, or returned invalid JSON."""


def model_name() -> str:
    return os.getenv("LLM_MODEL") or "not configured"


def fallback_model_name() -> str | None:
    return os.getenv("LLM_FALLBACK_MODEL") or None


def _client(timeout: float = TIMEOUT_SECONDS) -> OpenAI:
    base_url, api_key = os.getenv("LLM_BASE_URL"), os.getenv("LLM_API_KEY")
    if not (base_url and api_key and os.getenv("LLM_MODEL")):
        raise LLMError("LLM is not configured (LLM_BASE_URL / LLM_MODEL / LLM_API_KEY in backend/.env)")
    # max_retries=0: retries are decided here, explicitly (see _complete).
    return OpenAI(base_url=base_url, api_key=api_key, timeout=timeout, max_retries=0)


# ---------- rate limiter ----------

class RateLimiter:
    """Allows at most `max_per_minute` requests in any 60-second window. Extra requests wait (queue)
    instead of bursting; if the wait would exceed `max_wait` seconds, LLMError is raised instead."""

    def __init__(self, max_per_minute: int, clock=time.monotonic, sleep=time.sleep):
        self.max_per_minute = max(1, max_per_minute)
        self.clock, self.sleep = clock, sleep
        self._sent: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self, max_wait: float = MAX_QUEUE_SECONDS) -> float:
        """Block until a request may be sent. Returns how long we waited (seconds)."""
        started = self.clock()
        while True:
            with self._lock:
                now = self.clock()
                while self._sent and now - self._sent[0] >= 60:
                    self._sent.popleft()
                if len(self._sent) < self.max_per_minute:
                    self._sent.append(now)
                    return now - started
                wait = 60 - (now - self._sent[0])
            if now - started + wait > max_wait:
                raise LLMError(f"local limit of {self.max_per_minute} LLM requests/minute reached")
            self.sleep(min(wait, 1.0))


_limiter: RateLimiter | None = None
_limiter_lock = threading.Lock()


def get_limiter() -> RateLimiter:
    global _limiter
    rpm = int(os.getenv("LLM_MAX_RPM") or DEFAULT_MAX_RPM)
    with _limiter_lock:
        if _limiter is None or _limiter.max_per_minute != rpm:
            _limiter = RateLimiter(rpm)
        return _limiter


# ---------- one request, with the 429 policy ----------

def retry_after_seconds(error: Exception) -> float:
    """How long the provider asked us to wait: Retry-After header, or Gemini's "retryDelay": "13s" in the
    body. Capped at 8 s so a report never hangs."""
    response = getattr(error, "response", None)
    seconds = None
    if response is not None:
        header = response.headers.get("retry-after")
        if header:
            try:
                seconds = float(header)
            except ValueError:
                seconds = None
        if seconds is None:
            match = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', getattr(response, "text", "") or "")
            seconds = float(match.group(1)) if match else None
    return min(MAX_RETRY_AFTER_SECONDS, seconds if seconds is not None else DEFAULT_RETRY_AFTER_SECONDS)


@dataclass
class Reply:
    message: object  # the assistant message (content, tool_calls)
    ms: int
    model: str  # the model that actually answered
    note: str | None  # e.g. "gemini-3.6-flash rate-limited (429) ... -> answered by gemini-3.1-flash-lite"


def _send(client, model: str, messages: list[dict], extra: dict):
    get_limiter().acquire()
    return client.chat.completions.create(model=model, messages=messages, **extra)


def _complete(messages: list[dict], tools: list[dict] | None = None, timeout: float = TIMEOUT_SECONDS,
              retry_on_timeout: bool = False) -> Reply:
    client = _client(timeout)
    extra = {"tools": tools} if tools else {}
    if effort := os.getenv("LLM_REASONING_EFFORT"):
        extra["reasoning_effort"] = effort
    primary, fallback = model_name(), fallback_model_name()
    started = time.perf_counter()

    def elapsed() -> float:
        return round(time.perf_counter() - started, 1)

    def reply(response, model: str, note: str | None) -> Reply:
        if not response.choices:
            raise LLMError(f"{model} returned no choices")
        ms = round((time.perf_counter() - started) * 1000)
        log.info("LLM %s answered in %s ms%s", model, ms, f" ({note})" if note else "")
        return Reply(response.choices[0].message, ms, model, note)

    try:
        return reply(_send(client, primary, messages, extra), primary, None)
    except RateLimitError as e:
        wait = retry_after_seconds(e)
        log.warning("LLM %s rate-limited (429); waiting %.1f s, then one retry", primary, wait)
        time.sleep(wait)
        try:
            return reply(_send(client, primary, messages, extra), primary, f"429, retried after {wait:.0f} s")
        except Exception as e2:  # still failing (429 again, timeout, ...)
            reason = f"{primary} rate-limited (429), retry failed ({type(e2).__name__})"
        if fallback and fallback != primary:
            try:
                return reply(_send(client, fallback, messages, extra), fallback, f"{reason} -> answered by {fallback}")
            except Exception as e3:
                raise LLMError(f"{reason}; fallback {fallback} failed ({type(e3).__name__}) after {elapsed()} s") from e3
        raise LLMError(f"{reason} after {elapsed()} s") from e
    except APITimeoutError as e:
        if retry_on_timeout:  # only for slow, non-urgent calls (handover summary)
            log.warning("LLM %s timed out after %s s; one retry", primary, elapsed())
            try:
                return reply(_send(client, primary, messages, extra), primary, "timed out once, retried")
            except Exception as e2:
                raise LLMError(f"{type(e2).__name__} after {elapsed()} s (retried after a timeout)") from e2
        raise LLMError(f"APITimeoutError after {elapsed()} s") from e
    except LLMError:
        raise
    except Exception as e:  # network, other 4xx/5xx
        raise LLMError(f"{type(e).__name__} after {elapsed()} s") from e


# ---------- public helpers ----------

def parse_json(text: str) -> dict:
    """Parse a JSON object from the reply, tolerating ```json fences around it."""
    text = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text or "")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object")
    return data


def chat(messages: list[dict], tools: list[dict] | None = None) -> Reply:
    """One chat request (used for tool calling). Returns a Reply (message, ms, model, note)."""
    return _complete(messages, tools=tools)


def chat_json(messages: list[dict], timeout: float = TIMEOUT_SECONDS, retry_on_timeout: bool = False,
              json_retry: bool = False) -> dict:
    """One request whose reply must be a JSON object. Returns the dict plus "_llm_ms", "_llm_model"
    (which model answered) and "_llm_note". Invalid JSON raises LLMError, unless json_retry=True
    (one extra request; only the click-triggered handover summary uses it).

    We ask for JSON in the prompt instead of using response_format, because Gemini's OpenAI-compatible
    endpoint does not document `json_object` mode — the prompt + parser works with any provider.
    """
    r = _complete(messages, timeout=timeout, retry_on_timeout=retry_on_timeout)
    try:
        data = parse_json(r.message.content)
    except ValueError:
        if not json_retry:
            raise LLMError(f"{r.model} returned invalid JSON")
        log.warning("LLM %s returned invalid JSON; asking once more", r.model)
        retry = messages + [{"role": "assistant", "content": r.message.content or ""},
                            {"role": "user", "content": "That was not valid JSON. Reply again with ONLY the JSON object."}]
        r = _complete(retry, timeout=timeout)
        try:
            data = parse_json(r.message.content)
        except ValueError:
            raise LLMError(f"{r.model} returned invalid JSON twice")
    return {**data, "_llm_ms": r.ms, "_llm_model": r.model, "_llm_note": r.note}
