"""OpenAI-compatible LLM client, configured ONLY by env vars (backend/.env):

    LLM_BASE_URL, LLM_MODEL, LLM_API_KEY      (+ optional LLM_REASONING_EFFORT)

Swapping Gemini for any other OpenAI-compatible provider needs zero code changes.
The API key is never printed or logged.
"""
import json
import logging
import os
import re
import time

from openai import OpenAI

TIMEOUT_SECONDS = 20
log = logging.getLogger("uvicorn.error")  # shows up in the uvicorn terminal


class LLMError(Exception):
    """The LLM is not configured, failed, timed out, or kept returning invalid JSON."""


def model_name() -> str:
    return os.getenv("LLM_MODEL") or "not configured"


def _client() -> OpenAI:
    base_url, api_key = os.getenv("LLM_BASE_URL"), os.getenv("LLM_API_KEY")
    if not (base_url and api_key and os.getenv("LLM_MODEL")):
        raise LLMError("LLM is not configured (LLM_BASE_URL / LLM_MODEL / LLM_API_KEY in backend/.env)")
    # max_retries=0: we decide about retries ourselves (only once, on invalid JSON).
    return OpenAI(base_url=base_url, api_key=api_key, timeout=TIMEOUT_SECONDS, max_retries=0)


def parse_json(text: str) -> dict:
    """Parse a JSON object from the reply, tolerating ```json fences around it."""
    text = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text or "")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object")
    return data


def chat_json(messages: list[dict]) -> dict:
    """Send chat messages and return the reply as a dict. One retry if the reply is not valid JSON.

    We ask for JSON in the prompt instead of using response_format, because Gemini's OpenAI-compatible
    endpoint does not document `json_object` mode — the prompt + parser works with any provider.
    """
    client = _client()
    extra = {}
    if effort := os.getenv("LLM_REASONING_EFFORT"):
        extra["reasoning_effort"] = effort

    for attempt in (1, 2):
        started = time.perf_counter()
        try:
            response = client.chat.completions.create(model=os.environ["LLM_MODEL"], messages=messages, **extra)
        except Exception as e:  # timeout, network, 4xx/5xx — never retried here
            raise LLMError(f"{type(e).__name__} after {round(time.perf_counter() - started, 1)} s") from e
        ms = round((time.perf_counter() - started) * 1000)
        text = response.choices[0].message.content if response.choices else ""
        try:
            data = parse_json(text)
            log.info("LLM %s answered in %s ms (attempt %s)", model_name(), ms, attempt)
            return {**data, "_llm_ms": ms}
        except ValueError:
            log.warning("LLM returned invalid JSON in %s ms (attempt %s)", ms, attempt)
            messages = messages + [
                {"role": "assistant", "content": text or ""},
                {"role": "user", "content": "That was not valid JSON. Reply again with ONLY the JSON object."},
            ]
    raise LLMError("LLM returned invalid JSON twice")
