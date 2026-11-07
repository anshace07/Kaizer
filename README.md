# PlantPulse AI

A factory worker reports a problem by voice (Hindi, English or Hinglish). PlantPulse turns it into a structured incident, checks the machine's records and the safety manual, raises a simulated alert using fixed safety rules, and shows it on a supervisor dashboard.

Built for Gnani AI's Great Indian AI Internship Challenge. **All data in this repo is synthetic.**

See `CLAUDE.md` for the project brief and `NOTES.md` for a phase-by-phase build log.

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
.venvScriptspython -m app.scripts.try_stt path	oudio.wav
```

## Run the frontend

First time only: `cd frontend` then `npm install`.

Start it — **one command**, from `frontend/`:

```powershell
npm run dev
```

Open http://localhost:3000.

**Run both together:** open two terminals — start the backend in `backend/` (command above), then `npm run dev` in `frontend/`.

## Repo layout

- `backend/` — FastAPI + SQLAlchemy + SQLite (port 8000)
- `frontend/` — Next.js dashboard (port 3000)
- `data/` — synthetic machines, history, tickets, maintenance dates, safety manual (`sop.md`), test utterances
- `eval/` — evaluation scripts and results (later phase)
- `design/mockup.png` — UI layout and colour reference only
