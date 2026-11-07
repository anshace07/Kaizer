

A factory worker reports a problem by voice (Hindi, English or Hinglish). PlantPulse turns it into a structured incident, checks the machine's records and the safety manual, raises a simulated alert using fixed safety rules, and shows it on a supervisor dashboard.

Built for Gnani AI's Great Indian AI Internship Challenge. **All data in this repo is synthetic.**

See `CLAUDE.md` for the project brief and `NOTES.md` for a phase-by-phase build log.

## Run with Docker (Mac)

Works on Apple Silicon (M1/M2/M3/M4) and Intel Macs. You only need Docker Desktop and two API keys.

**Before the first time**

1. Install **Docker Desktop** from https://www.docker.com/products/docker-desktop/ — pick "Mac with Apple chip"
   or "Mac with Intel chip" (Apple menu  → About This Mac shows which one you have).
2. Open Docker Desktop and wait until it says **Engine running** (whale icon in the top menu bar).
3. Have your keys ready: a **Gnani API key** and a **Google Gemini API key** (from aistudio.google.com).

**Run it** — open the **Terminal** app and type these, one line at a time, pressing Enter after each:

```bash
git clone https://github.com/riyakatiyar123/IndusPulse-AI.git
cd IndusPulse-AI
cp backend/.env.example backend/.env
open -e backend/.env
```

- If the Mac asks to install "command line developer tools" (for `git`), click **Install**, wait, then run
  the `git clone` line again. If GitHub asks you to sign in, ask the repo owner to add you as a collaborator.
- The last line opens `backend/.env` in TextEdit. Paste your Gnani key right after `GNANI_API_KEY=` and your
  Gemini key right after `LLM_API_KEY=` (no spaces, no quotes). Everything else is already filled in.
  Save (⌘S) and close TextEdit.

Then start everything:

```bash
docker compose up --build
```

The first start takes a few minutes (it downloads and builds everything). It is ready when you see
`backend-1 | ... Uvicorn running on http://0.0.0.0:8000` and `frontend-1 | ✓ Ready in ...`.
Leave this Terminal window open.

Open **http://localhost:3000** in **Chrome**. You should see the PlantPulse AI dashboard with 6 synthetic past
incidents. On **Report Incident**, click the purple mic and choose **Allow** when Chrome asks for the microphone.

- **Stop:** press `Ctrl + C` in that Terminal window.
- **Start again later:** `cd IndusPulse-AI` then `docker compose up` (no `--build` needed unless the code changed).
- **Get the latest code:** `git pull` then `docker compose up --build`.
- **Start over with clean demo data:** `docker compose down -v` (deletes the saved incidents), then `docker compose up`.
- Your data (incidents, cached voice audio) is kept between restarts in Docker volumes. Your keys stay in
  `backend/.env` on your Mac and are never copied into the Docker images.
- "Port is already allocated": something else is using port 3000 or 8000 — quit it (or other PlantPulse
  windows) and run `docker compose up` again.

## Run the backend

First time only (Windows, from the repo root):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env   # then fill in keys (not needed for Phase 1)
```

Start it — **one command**, from `backend/`:

```powershell
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

The first start creates `backend/plantpulse.db` and loads the synthetic data automatically.
Open http://localhost:8000/docs to try every endpoint.

Wipe and re-seed the database: `.venv\Scripts\python -m app.seed`

## Speech-to-text (Gnani Prisma v3.0)

Needs `GNANI_API_KEY` in `backend/.env` and ffmpeg installed (`winget install Gyan.FFmpeg`). Every result is
cached in `backend/cache/` by the audio's SHA-256, so the same file never costs credits twice.

Try one file from the command line (from `backend/`):

```powershell
.venv\Scripts\python -m app.scripts.try_stt path\to\audio.wav
```

## LLM extraction + safety rules

`backend/.env` needs `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` (any OpenAI-compatible provider; we use
Google Gemini `gemini-3.1-flash-lite`, with `gemini-3.6-flash` as `LLM_FALLBACK_MODEL` when rate-limited, and
`LLM_MAX_RPM=12`). If the LLM fails or times out (20 s), a keyword extractor takes over.
Fixed safety rules live in `backend/app/safety/safety_rules.yaml` and always run, LLM or not.

Run the tests (from `backend/`, they never call the real LLM):

```powershell
.venv\Scripts\python -m pytest -q
```

## Voice (Gnani Timbre text-to-speech)

Spoken acknowledgements, confirmation questions and the shift-handover summary use Timbre `timbre-v2.5`
(hi-IN) through the `gnani-vachana` SDK. Pick the voice with `TTS_VOICE` in `backend/.env` (default `Urmila`).
Audio is cached in `backend/cache/tts/` by text, so a sentence is only paid for once. Use the
"Voice on / off" button in the header to mute.

## Run the frontend

First time only: `cd frontend` then `npm install`.

Start it — **one command**, from `frontend/`:

```powershell
npm run dev
```

Open http://localhost:3000.

**Run both together:** open two terminals — start the backend in `backend/` (command above), then `npm run dev` in `frontend/`.

## Recording a demo

Set `ALLOW_DEMO_RESET=true` in `backend/.env` (dev only) and restart the backend. Then in the app open
**Settings → Reset demo**: it deletes every incident and restores the clean seed (6 past incidents, 16 machines,
open tickets). The button only appears under `npm run dev`.

## Repo layout

- `backend/` — FastAPI + SQLAlchemy + SQLite (port 8000)
- `frontend/` — Next.js dashboard (port 3000)
- `data/` — synthetic machines, history, tickets, maintenance dates, safety manual (`sop.md`), test utterances
- `eval/` — evaluation scripts and results (later phase)
- `design/mockup.png` — UI layout and colour reference only
