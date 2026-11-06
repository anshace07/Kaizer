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
