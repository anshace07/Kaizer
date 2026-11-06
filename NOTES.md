# Build notes

## Phase 1 — Foundation (fake data only)

**What was built and why**
- Synthetic data in `data/`: 15 machines with spoken aliases (English/Hindi/Hinglish, Latin and Devanagari), past events, 8 open tickets, service dates, a 6-section safety manual, and 30 test utterances with expected answers — so every later phase has something real-looking to test against without using real people's data.
- FastAPI backend with SQLite tables for machines, incidents, an incident event log and tickets; it auto-seeds 6 past incidents on first start so the dashboard is never empty. Endpoints: health, machines, incidents (list/filter/detail/create/status), stats.
- A temporary keyword-matching extractor (`/api/incidents/extract`) stands in for the LLM so the whole pipeline can be wired up before Phase 4. `confidence` is left empty because we have not measured anything yet.

**Likely interview questions**
- *Q: Why have a fake keyword extractor at all if you'll replace it with an LLM?*
  A: It lets us build and test the API and dashboard end-to-end on day one with zero API cost. It is also a baseline: later we can compare the LLM against it on the same 30 test utterances. (Its output on those utterances is not a real accuracy figure, because the same person wrote both the test sentences and the keyword lists.)
- *Q: Why is there a separate `incident_events` table instead of just a `status` column?*
  A: A status column only says where an incident is now. The events table is a timestamped audit trail — who changed what and when — which a supervisor needs after a safety incident, and it lets the dashboard show a timeline.

## Phase 2 — Frontend (no voice yet)

**What was built and why**
- A Next.js dashboard in `frontend/` (layout and colours from `design/mockup.png`): Dashboard with stat cards, recent incidents and a red "Simulated alert" banner while any Critical incident is open; Incidents list with severity/status filters; Incident Detail with Overview / AI Investigation / SOP & Actions / Timeline tabs and Acknowledge / In Progress / Resolve buttons; Shift Handover; AI Performance ("Not evaluated yet").
- Report Incident has a placeholder mic button, language chips and a "Type report instead" box → `/api/incidents/extract` → an editable Confirm Details screen → `POST /api/incidents` → the new incident's page. The worker always checks the AI's understanding before anything is saved.
- Pages poll the API every 5 s (`useAutoRefresh`) instead of using websockets — simplest thing that keeps the dashboard live. `/api/stats` gained `unresolved_by_severity` so the Critical/High cards count only open incidents. Confidence shows "—" everywhere because nothing is measured yet.

**Likely interview questions**
- *Q: Why polling every 5 seconds instead of websockets?*
  A: A handful of supervisors refreshing a small JSON list every 5 s costs almost nothing, needs no extra server code, and is easy to explain and debug. If the plant had hundreds of screens or needed sub-second alerts, we'd switch to websockets or server-sent events.
- *Q: Why a Confirm Details screen instead of creating the incident straight from the transcript?*
  A: Speech-to-text and extraction can be wrong — a misheard machine number sends the team to the wrong place. Letting the worker check and edit the fields first catches those mistakes at the cheapest point. The fixed safety rules (later phase) still run on the raw transcript, so editing can't hide a danger word.
