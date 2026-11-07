"""Text-to-speech with Gnani Timbre (official SDK `gnani-vachana`).

speak(text) -> {"audio_id", "cached", "tts_ms"}; the audio is served by GET /api/tts/<audio_id>.

- Model is ALWAYS "timbre-v2.5"; language hi-IN; voice from TTS_VOICE in backend/.env (default Urmila:
  female Hindi voice the Gnani catalogue lists for "formal announcements").
- Cached in backend/cache/tts/<sha256>.wav, keyed by model + voice + language + speed + text, so the same
  sentence never costs credits twice. No automatic retries. The API key is never printed or logged.
"""
import hashlib
import logging
import os
import re
import struct
import threading
import time

from gnani.tts import AudioConfig, GnaniTTSClient
from gnani.tts.exceptions import APIError, GnaniTTSError

from ..db import BACKEND_DIR

MODEL = "timbre-v2.5"
LANGUAGE = "hi-IN"
DEFAULT_VOICE = "Urmila"
SPEED = 1.0
MAX_CHARS = 400  # our sentences are short; this stops accidental long (expensive) requests
TIMEOUT_SECONDS = 20
CACHE_DIR = BACKEND_DIR / "cache" / "tts"
AUDIO_CONFIG = dict(sample_rate=22050, num_channels=1, sample_width=2, container="wav")

log = logging.getLogger("uvicorn.error")
# Gnani allows ONE active request per key, and requests can arrive together (e.g. React dev mode runs effects
# twice). One Timbre call at a time; the second request then finds the first one's audio in the cache.
_timbre_lock = threading.Lock()


class TTSError(Exception):
    """Speech failed. The message is safe to show; the caller still shows the text."""


def voice() -> str:
    return os.getenv("TTS_VOICE") or DEFAULT_VOICE


def spoken_text(text: str) -> str:
    """CLAUDE.md: say "Machine 14", never "M-14" (also catches M14 / M-04 written by an LLM)."""
    text = re.sub(r"\bM-?0*(\d{1,2})\b", lambda m: f"Machine {int(m.group(1))}", text)
    return re.sub(r"\s+", " ", text).strip()


def audio_id_for(text: str) -> str:
    key = f"{MODEL}|{voice()}|{LANGUAGE}|{SPEED}|{AUDIO_CONFIG['sample_rate']}|{text}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def audio_path(audio_id: str):
    if not re.fullmatch(r"[0-9a-f]{64}", audio_id or ""):
        return None
    path = CACHE_DIR / f"{audio_id}.wav"
    return path if path.exists() else None


def fix_wav_header(audio: bytes) -> bytes:
    """Timbre sends a streaming-style WAV header with sizes 0xFFFFFFFF, so browsers show a huge duration.
    Write the real RIFF and data sizes in (the audio itself is unchanged)."""
    if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        return audio
    out, i = bytearray(audio), 12
    out[4:8] = struct.pack("<I", len(audio) - 8)
    while i + 8 <= len(audio):
        chunk, size = audio[i:i + 4], struct.unpack("<I", audio[i + 4:i + 8])[0]
        if chunk == b"data":
            out[i + 4:i + 8] = struct.pack("<I", len(audio) - i - 8)
            break
        i += 8 + size + (size % 2)
    return bytes(out)


def _error_message(e: Exception) -> str:
    if isinstance(e, APIError):
        s = getattr(e, "status_code", None)
        return {401: "Gnani rejected the API key (check GNANI_API_KEY).", 402: "Gnani account is out of credits.",
                403: "This Gnani key may not use text-to-speech.",
                429: "Gnani is busy with another request from this key."}.get(s, f"Timbre error {s}")
    return f"Timbre failed: {type(e).__name__}"


def speak(text: str) -> dict:
    """Return {"audio_id", "cached", "tts_ms", "text"} for `text`, calling Timbre only on a cache miss."""
    text = spoken_text(text)
    if not text:
        raise TTSError("Nothing to say.")
    if len(text) > MAX_CHARS:
        raise TTSError(f"Text too long for speech ({len(text)} > {MAX_CHARS} characters).")
    key = os.getenv("GNANI_API_KEY", "").strip()
    audio_id = audio_id_for(text)
    if audio_path(audio_id):
        log.info("TTS cache hit %s...", audio_id[:12])
        return {"audio_id": audio_id, "cached": True, "tts_ms": None, "text": text}
    if not key:
        raise TTSError("GNANI_API_KEY is not set in backend/.env.")

    with _timbre_lock:
        if audio_path(audio_id):  # another request just made it
            return {"audio_id": audio_id, "cached": True, "tts_ms": None, "text": text}
        return _synthesize(text, audio_id, key)


def _synthesize(text: str, audio_id: str, key: str) -> dict:
    started = time.perf_counter()
    try:
        client = GnaniTTSClient(api_key=key, timeout=TIMEOUT_SECONDS)
        audio = client.synthesize(text, voice=voice(), model=MODEL, language=LANGUAGE, speed=SPEED,
                                  audio_config=AudioConfig(**AUDIO_CONFIG))
    except (GnaniTTSError, ValueError, OSError) as e:
        log.warning("TTS failed after %s ms: %s", round((time.perf_counter() - started) * 1000), type(e).__name__)
        raise TTSError(_error_message(e)) from e
    tts_ms = round((time.perf_counter() - started) * 1000)
    if not audio:
        raise TTSError("Timbre returned no audio.")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    audio = fix_wav_header(audio)
    (CACHE_DIR / f"{audio_id}.wav").write_bytes(audio)
    log.info("TTS Timbre call (%s, %s) in %s ms, %s bytes", voice(), MODEL, tts_ms, len(audio))
    return {"audio_id": audio_id, "cached": False, "tts_ms": tts_ms, "text": text}


def try_speak(text: str) -> dict:
    """Like speak() but never raises: audio must never block the flow. Returns text + audio or an error."""
    try:
        return {**speak(text), "error": None}
    except TTSError as e:
        return {"audio_id": None, "cached": False, "tts_ms": None, "text": spoken_text(text), "error": str(e)}
