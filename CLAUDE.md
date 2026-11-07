# DECOY — project brief

## What we're building
A factory worker reports a problem by voice in Hindi, English or Hinglish. PlantPulse turns it into a structured incident, checks that machine's records and the safety manual, raises an alarm using fixed safety rules, and shows everything on a supervisor dashboard. Built for Gnani AI's Great Indian AI Internship Challenge. Deadline: Tue 10 Nov 2026, 11:59 PM IST.

## Non-negotiable rules
1. A working end-to-end demo beats extra features. Each phase must run before the next starts.
2. Never commit secrets. Keys live in backend/.env (gitignored). Keep backend/.env.example updated.
3. All data is synthetic and labelled "synthetic" in the UI. No real names, phone numbers or recorded real calls.
4. Never show a number we didn't measure. No fake accuracy, latency or impact claims.
5. Safety rules are plain Python, run on the RAW transcript AND the extracted fields, and the LLM can never lower or suppress a rule-triggered alert.
6. The app never controls machines. Alerts are simulated and labelled "Simulated alert".
7. After every phase: append to NOTES.md (what was built and why in 3 plain lines + 2 likely interview questions with answers), then git commit with a clear message and push.
8. Keep code simple and readable — a student must be able to explain every file in an interview.
9. UI follows design/mockup.png for layout and colours only. Ignore every number shown in the mockup.

## Stack
- frontend/: Next.js (App Router, TypeScript) + Tailwind + shadcn/ui. Port 3000.
- backend/: Python 3.11+, FastAPI, SQLAlchemy + SQLite. Port 8000.
- data/: synthetic seed JSON, safety manual (sop.md), test utterances.
- eval/: evaluation scripts and results.

## Gnani AI (required)
- Speech-to-text = Prisma v3.0. POST https://api.vachana.ai/stt/v3, header X-API-Key-ID: $GNANI_API_KEY. Multipart fields: audio_file, model=prisma-v3.0, language_code=hi-IN,en-IN, format=codemix, keyterms (JSON array, max 200: machine IDs, names, aliases + factory words), topic (one line describing a factory incident report). Response has success, transcript, detected_language_code. Max 30 s per request. Accepted formats: WAV, MP3, OGG, FLAC, AAC, M4A — NOT webm, so convert browser recordings to 16 kHz mono WAV with ffmpeg. Transcripts may mix Devanagari and Latin script.
- Text-to-speech = Timbre via official Python SDK gnani-vachana (from gnani.tts import GnaniTTSClient). ALWAYS pass model="timbre-v2.5". In spoken text write "Machine 14", never "M-14".
- Docs: https://docs.gnani.ai (index: https://docs.gnani.ai/llms.txt). If a Gnani call fails, read the relevant docs page before guessing.
- Cache every STT/TTS result by content hash so the same input never costs credits twice. Never call Gnani in loops or automated tests without asking.

## LLM (reasoning step)
- backend/app/llm.py: OpenAI-compatible client configured only by env vars LLM_BASE_URL, LLM_MODEL, LLM_API_KEY. Swapping models needs zero code changes.
- UI footer shows: "Data: synthetic · STT: Prisma v3.0 · TTS: Timbre · LLM: <LLM_MODEL>".
