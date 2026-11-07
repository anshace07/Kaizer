"""Speech-to-text with Gnani Prisma v3.0.

transcribe(wav_bytes, language_code) -> {"transcript", "detected_language_code", "stt_ms", "cached"}

- Every result is cached in backend/cache/stt/<sha256 of the audio>_<language>.json, so the same
  audio + language never costs credits twice.
- No automatic retries: a failed call is reported, never repeated in a loop.
- The API key is read from backend/.env and is never printed or logged.
"""
import hashlib
import json
import logging
import os
import time

import httpx

from ..db import BACKEND_DIR, DATA_DIR

STT_URL = "https://api.vachana.ai/stt/v3"
MODEL = "prisma-v3.0"
# Report page chips -> Prisma language_code. Hinglish (default) lets Prisma hear both.
LANGUAGE_CODES = {"hindi": "hi-IN", "english": "en-IN", "hinglish": "hi-IN,en-IN"}
FORMAT = "codemix"
TOPIC = "A factory worker reporting a machine problem or safety incident on the plant floor."
TIMEOUT_SECONDS = 60
MAX_KEYTERMS = 200
CACHE_DIR = BACKEND_DIR / "cache" / "stt"

FACTORY_WORDS = ["dhuan", "धुआं", "smoke", "gas", "leak", "badbu", "chingari", "sparks", "aag", "fire",
                 "vibration", "awaaz", "garam", "temperature", "oil"]

# Uvicorn prints this logger to its terminal.
log = logging.getLogger("uvicorn.error")


class STTError(Exception):
    """A speech-to-text failure. `status` is the HTTP status our API returns; the message is user-safe."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def build_keyterms() -> list[str]:
    """Words Prisma should listen for: factory words, then machine IDs and names, then aliases.

    There are more aliases than the 200 allowed, so aliases are taken round-robin (1st alias of
    every machine, then 2nd of every machine...) so that each machine gets some.
    """
    machines = json.loads((DATA_DIR / "machines.json").read_text(encoding="utf-8"))["machines"]
    ordered = list(FACTORY_WORDS)
    ordered += [m["id"] for m in machines]
    ordered += [m["name"] for m in machines]
    longest = max(len(m["aliases"]) for m in machines)
    for i in range(longest):
        ordered += [m["aliases"][i] for m in machines if i < len(m["aliases"])]

    terms, seen = [], set()
    for term in ordered:
        term = term.strip()
        key = term.lower()
        if term and key not in seen and "<|" not in term and "|>" not in term:  # Prisma rejects <| and |>
            seen.add(key)
            terms.append(term)
    return terms[:MAX_KEYTERMS]


def _api_key() -> str:
    key = os.getenv("GNANI_API_KEY", "").strip()
    if not key:
        raise STTError("GNANI_API_KEY is not set. Add it to backend/.env and restart the backend.", 500)
    return key


def _error_message(response: httpx.Response) -> STTError:
    """Turn Gnani's error responses (three different JSON shapes) into one clear message."""
    try:
        body = response.json()
    except ValueError:
        body = {}
    code, detail = "", ""
    if isinstance(body.get("error"), dict):  # {"success": false, "error": {"type", "message"}}
        code, detail = body["error"].get("type", ""), body["error"].get("message", "")
    elif isinstance(body.get("detail"), dict):  # 401/402/403/429: {"detail": {"error_code", "message"}}
        code, detail = body["detail"].get("error_code", ""), body["detail"].get("message", "")
    elif "code" in body:  # 504: {"error", "code", "message"}
        code, detail = body.get("code", ""), body.get("message", "")
    elif "detail" in body:  # 422 validation
        detail = str(body["detail"])

    s = response.status_code
    if s == 401:
        return STTError("Gnani rejected the API key. Check GNANI_API_KEY in backend/.env.", 502)
    if s == 402:
        return STTError("Gnani account is out of credits.", 502)
    if s == 403:
        return STTError("This Gnani API key is not allowed to use speech-to-text.", 502)
    if s == 429:
        return STTError("Gnani is busy with another request from this key. Try again in a few seconds.", 503)
    if code == "MAX_AUDIO_DURATION_EXCEEDED":
        return STTError("Recording is too long for Prisma (max 30 s).", 400)
    if code in ("UNSUPPORTED_AUDIO_FORMAT", "AUDIO_CONVERSION_ERROR", "EMPTY_AUDIO"):
        return STTError(f"Prisma could not read the audio ({code}).", 400)
    if s == 504 or code == "UPSTREAM_TIMEOUT":
        return STTError("Prisma timed out. Try a shorter recording or try again.", 504)
    return STTError(f"Prisma error {s} {code}: {detail}".strip(), 502)


def transcribe(wav: bytes, language_code: str = LANGUAGE_CODES["hinglish"]) -> dict:
    """Send 16 kHz mono WAV bytes to Prisma (or return the cached result)."""
    digest = hashlib.sha256(wav).hexdigest()
    cache_file = CACHE_DIR / f"{digest}_{language_code.replace(',', '+')}.json"
    if cache_file.exists():
        result = json.loads(cache_file.read_text(encoding="utf-8"))
        log.info("STT cache hit %s... (original call took %s ms)", digest[:12], result["stt_ms"])
        return {**result, "cached": True}

    data = {
        "model": MODEL,
        "language_code": language_code,
        "format": FORMAT,
        "keyterms": json.dumps(build_keyterms(), ensure_ascii=False),
        "topic": TOPIC,
    }
    started = time.perf_counter()
    try:
        response = httpx.post(
            STT_URL,
            headers={"X-API-Key-ID": _api_key()},
            data=data,
            files={"audio_file": ("audio.wav", wav, "audio/wav")},  # Prisma reads the format from ".wav"
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException:
        raise STTError(f"No reply from Prisma within {TIMEOUT_SECONDS} s.", 504)
    except httpx.HTTPError as e:
        raise STTError(f"Could not reach Prisma: {type(e).__name__}", 502)
    stt_ms = round((time.perf_counter() - started) * 1000)
    log.info("STT Prisma call: HTTP %s in %s ms", response.status_code, stt_ms)

    if response.status_code != 200:
        raise _error_message(response)
    body = response.json()
    if not body.get("success", False):
        raise _error_message(response)

    result = {
        "transcript": body.get("transcript", ""),
        "detected_language_code": body.get("detected_language_code"),
        "stt_ms": stt_ms,
        "request_id": body.get("request_id"),
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {**result, "cached": False}
