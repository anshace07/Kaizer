"""Transcribe one audio file with Prisma and print the result.

Usage (from backend/):  .venv\\Scripts\\python -m app.scripts.try_stt path\\to\\audio.wav
Uses the same conversion + cache as the API, so running it twice on one file costs one call.
"""
import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from ..db import BACKEND_DIR
from ..services import audio, stt


def main():
    parser = argparse.ArgumentParser(description="Transcribe an audio file with Gnani Prisma v3.0")
    parser.add_argument("file", type=Path)
    args = parser.parse_args()

    load_dotenv(BACKEND_DIR / ".env")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console: allow Devanagari output

    try:
        wav, seconds = audio.prepare(args.file.read_bytes(), args.file.name)
        result = stt.transcribe(wav)
    except (audio.AudioError, stt.STTError, OSError) as e:
        print(f"Error: {e}")
        sys.exit(1)

    print(f"Audio:      {seconds:.1f} s")
    print(f"Language:   {result['detected_language_code']}")
    print(f"STT time:   {result['stt_ms']} ms" + (" (cached result)" if result["cached"] else ""))
    print(f"Transcript: {result['transcript']}")


if __name__ == "__main__":
    main()
