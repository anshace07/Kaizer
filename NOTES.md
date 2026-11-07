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

## Phase 3 — Real speech-to-text (Gnani Prisma v3.0)

**What was built and why**
- `backend/app/services/audio.py` converts any upload (browser webm, mp3, m4a…) to 16 kHz mono WAV with ffmpeg and rejects recordings over 28 s, because Prisma only accepts a few formats and at most 30 s. It finds ffmpeg even when a terminal's PATH is stale (it reads the PATH saved in the Windows registry).
- `backend/app/services/stt.py` calls Prisma exactly as specified in CLAUDE.md: `hi-IN,en-IN`, codemix, a one-line topic, and 200 keyterms built from `machines.json` plus factory words. It turns Gnani's three error formats into clear messages, makes no automatic retries, logs the measured call time, and caches every result by the audio's SHA-256 in `backend/cache/`. `POST /api/transcribe` and the CLI `python -m app.scripts.try_stt <file>` both use it.
- The Report page mic records with MediaRecorder: a timer, a live level meter, and auto-stop at 25 s. There is also an "Upload audio file" button. The page shows "What we heard" (with the measured STT time) before continuing into the same extract → Confirm Details flow, so the worker always sees and checks the transcript first. The test used 3 real Prisma calls in total.

**Likely interview questions**
- *Q: Why convert to WAV on the server instead of recording WAV in the browser?*
  A: Browsers record webm or ogg, and Prisma doesn't accept webm. Converting once on the server with ffmpeg handles every source the same way: mic, phone uploads, and old recordings. It also gives a fixed 16 kHz mono format, which is what speech models expect. The same WAV bytes always give the same hash, which makes the cache reliable.
- *Q: There are 226 machine aliases but Prisma allows 200 keyterms. How did you choose?*
  A: Factory danger words go first, then every machine ID and name. Aliases are then added round-robin (the 1st alias of every machine, then the 2nd…) until we reach 200, so no machine loses all its aliases. The list is built from `machines.json` automatically, so adding a machine needs no code change.

## Phase 4 — Real brain, safety layer, confirm-back

**What was built and why**
- `app/llm.py` is an OpenAI-compatible client set only by env vars (Google Gemini `gemini-3.6-flash` via its OpenAI endpoint). It has a 20 s timeout and one retry on invalid JSON. `app/services/extract.py` sends the transcript, every known machine with its aliases, and 6 Hinglish/Hindi few-shot examples (including messy STT text). It validates the reply with Pydantic and then never trusts it about machines: unknown IDs are dropped, and a missing or ambiguous machine forces a short Hinglish confirmation question. If the LLM fails, the old keyword extractor takes over and the timeline says so.
- `app/safety/rules.py` + `safety_rules.yaml` hold fixed keyword rules in English, Hinglish and Devanagari. They run on the RAW transcript and on the extracted fields, both at extract time and again on the server when the incident is saved. Any hit gives Critical + Escalated, a "Safety rule S1 triggered: dhuan" timeline event, and a severity that neither the LLM nor the confirm screen can lower. Each incident stores the transcript, the full extraction JSON, rule hits, the LLM's suggestion, the final severity and what decided it.
- The confirm screen shows the raw transcript, rule hits and the AI's question, with one button per candidate machine (14 vs 40). Saving stays blocked until the worker answers. The language chips now set Prisma's `language_code`. The DB is upgraded in place (new columns, renamed incident types) so no data is lost. M-40 (Thermic Fluid Heater) was added as a 16th synthetic machine.

**Measured (headless Chrome, typed text, 7 Nov 2026):** "Machine 14 mein dhuan aa raha hai" → Critical + red dashboard alert in **5.6 s** end to end. That is extract (LLM + rules) 3.8 s, create + open incident 0.6 s, dashboard showing the alert 1.2 s, with no human think time. Case (b) extract took 2.3 s. These are single runs, not averages.

**Model choice:** `gemini-3.8-flash`, the newest stable Flash, never replied within 20–60 s for this project, on the OpenAI endpoint and the native API, streamed or not. `gemini-3.7-flash` routes to it. `gemini-3.6-flash` (stable since Jul 2026) answers in about 2–3 s, so we use it. 13 real LLM calls were used in this phase, 7 of them while diagnosing that.

**Not done yet:** `data/test_utterances.json` still uses the old incident type names. Update it in the evaluation phase.

**Likely interview questions**
- *Q: If the LLM is so good, why keep keyword rules?*
  A: The LLM is probabilistic. It can be down, slow, or simply wrong, and for smoke, gas or fire a miss is far worse than a false alarm. The rules are a few lines of plain Python anyone can audit. They run on the raw words the worker said, and the code makes it impossible for the LLM's answer to lower them. Our test with the LLM mocked to say "low" for "dhuan" proves it stays Critical.
- *Q: What does "model confidence (self-reported)" mean — is it accurate?*
  A: It's the number the LLM says about itself, so it is not a measured accuracy and we label it that way. We only use it as a hint. The real safeguards are the confirmation question when the machine is unclear and the fixed safety rules. Measured accuracy will come from the evaluation phase on the test utterances.

## Phase 5 — AI investigation

**What was built and why**
- `app/agent/tools.py` has 4 plain, tested functions: `get_machine_history`, `check_open_tickets`, `get_maintenance_schedule` and `search_sop` (keyword search over the `## SOP-1xx` sections of `data/sop.md`). The LLM never touches the database. It can only name one of these tools, and `run_tool()` checks the name and the machine ID before anything runs.
- `app/agent/investigate.py` runs as a FastAPI background task right after an incident is saved, so creating stays fast (~0.3–0.4 s measured). It uses OpenAI-style function calling restricted to the 4 tools, max 5 calls. If tool calling fails, or the model answers without calling a tool, it calls all 4 tools in a fixed order instead. Then the LLM writes 3 findings, 1 action and the SOP id from the tool results only. The SOP id must come from the search results; if the LLM is down, a plain template builds the summary. Every tool call is a timeline event (tool, args, result, ms) and the path used is recorded. The investigation never writes severity (tested).
- A new report for the same machine within 10 minutes is linked as "Related to INC-xxxx" with Merge / Keep separate buttons; nothing is merged automatically. Merging can only raise the original's severity and carries over rule hits, so merging never hides an alert. Merging into an already-resolved incident is blocked.

**Measured (7 Nov 2026, real Gemini `gemini-3.6-flash`, typed report "Machine 14 mein smoke aa raha hai"):** path = tool calling, with all 4 tools called in one turn, so 2 LLM calls per investigation. The investigation took 6.2 s (INC-1010) and 14.5 s (INC-1011): same work, single runs, so LLM latency varies a lot. Each tool took 1–5 ms. Repeating the report gave "Related to INC-1010". This phase used 6 real LLM calls and 0 Gnani calls. Tests: 24 passed, LLM always mocked, and `conftest.py` blocks any real LLM call.

**Likely interview questions**
- *Q: Why give the LLM tools instead of pasting all the data into the prompt?*
  A: The tools are the only door to the data. They're small, tested, read-only functions with checked arguments, so the model can't run SQL or read other machines' data by accident. Every call is logged with its timing, so a supervisor can see exactly what evidence the recommendation came from. With 16 machines we could paste everything, but in a real plant there would be years of history and the prompt would explode.
- *Q: What if the model makes things up in the findings?*
  A: We limit it three ways. The prompt says to use only tool results and to say when evidence is missing. The SOP id is checked against the actual search results and replaced if invented. The raw evidence (history, tickets, service date, SOP text) is shown next to the findings so a human can check them. The findings are advice only: severity and alerts come from the fixed safety rules, never from the investigation.

## Phase 6 — Gnani Timbre voice

**What was built and why**
- `app/services/tts.py` uses the official `gnani-vachana` SDK with `timbre-v2.5`, `hi-IN`, and the voice from `TTS_VOICE`. The default is **Urmila**, a female Hindi voice the Gnani catalogue lists for "formal announcements", which suits a plant floor. Audio is cached by a hash of model+voice+language+text in `backend/cache/tts/`. Timbre calls run one at a time behind a lock, because Gnani allows one active request per key. "M-14" is always rewritten to "Machine 14" before speaking. Timbre sends a streaming WAV header (sizes `0xFFFFFFFF`, so players showed ~97,000 s); we write the real sizes in.
- After Confirm, the app speaks a FIXED Hinglish template (no LLM), e.g. "Report mil gaya. Machine 14 par dhuan — Critical alert bhej diya gaya hai." The confirm screen also speaks the confirmation question. The Shift Handover "Generate summary" button has the LLM write a ≤60-word Hinglish summary of open incidents only, most severe first. It is checked for word count and for mentioning only open machines, falls back to a grouped template if it fails, and is then spoken with a player plus text.
- A "Voice on/off" header toggle is saved in localStorage inside try/catch. Audio never blocks anything: if TTS fails, the text still shows in the header and on the page with "voice unavailable".

**Measured (7 Nov 2026, single runs):** Timbre took 1.7 s for a ~5 s sentence (2 direct calls). In headless Chrome, the confirmation question played (2.9 s audio, from cache), the acknowledgement played (6.2 s) and the handover audio played (26.9 s). During the handover test Gemini hit our 20 s timeout, so the template summary was used and spoken. The same spike pushed INC-1012's investigation onto its fixed-order fallback, showing both fallbacks work. That template repeated "Machine 14 par dhuan" 5 times, so it now groups repeats ("— 5 reports") and drops only whole sentences. This phase used 4 Timbre calls and 4 LLM calls; the extraction for the final browser test was a canned fixture (labelled as such) to stay under budget. Tests: 37 passed, with Timbre and the LLM mocked.

**Likely interview questions**
- *Q: Why is the acknowledgement a fixed template instead of LLM text?*
  A: It's a safety message heard on a noisy floor. It must be instant, identical every time, and never wrong about the machine or severity. A template built from the saved fields can't hallucinate, needs no LLM call, and the same sentence hits the TTS cache, so a repeated alert costs nothing and plays immediately.
- *Q: What happens if Gnani TTS is down during an emergency?*
  A: Nothing important breaks. Every spoken message is also shown as text (header bar and page), TTS errors are caught and reported as "voice unavailable", and audio never delays saving the incident or the safety alert. The dashboard alert comes from the safety rules, not from audio.

## Phase 6.1 — Natural-sounding speech (part 1)

**What was built and why**
- Romanized Hindi ("dhuan", "par") sounds unnatural in Timbre. Every spoken message now has a separate SPOKEN version: Hindi words in Devanagari, digits kept, and English words the voice says well kept in Latin ("Report मिल गया। Machine 14 पर धुआं — Critical alert भेज दिया गया है।"). The screen keeps the Hinglish text. This applies to the acknowledgement template, the confirmation question (built from the machine candidates, no LLM) and the handover summary, where the LLM writes both versions and the spoken one must contain Devanagari or the template is used.
- `TTS_MODEL` is now configurable (`timbre-v2.5` default; the SDK also supports `timbre-v3.0`). Four samples of the same sentence were generated for a listening test (`backend/voice_samples/`, not committed): v2.5 Urmila and Deepak, v3.0 Kalpana and Yashraj. The voice choice is pending, so Urmila v2.5 stays for now.
- The last handover summary was the template because Gemini hit 20 s, and an investigation timed out at 20 s in the same minute. The handover summary now uses a 35 s timeout with one retry on timeout; other calls are unchanged. 40 tests pass.

**Likely interview question**
- *Q: Why not just send the Hinglish screen text to the voice?*
  A: The TTS voice is trained on Hindi in Devanagari, so romanized Hindi is read like English letters and sounds wrong. Keeping two versions costs nothing for templates, and for the LLM summary we validate the spoken version separately. The screen stays readable for supervisors who type in Latin script.

## Phase 6.5 — Demo-ready look

**What was built and why**
- Styling only, closer to `design/mockup.png`: Inter font, white cards with soft shadows and rounded-2xl corners, a cleaner dark sidebar with a filled purple active item and a Settings link, pastel stat cards with icon tiles, and content width capped at 1440 px so it looks balanced in a 1920×1080 recording. All pages and incident tabs were checked at 1920×1080 in headless Chrome with no overflow or sideways scroll.
- Motion with a purpose: a global "Simulated alert · Critical" banner slides in and pulses when a NEW critical incident appears, with a short two-tone beep (Web Audio, no file, respects Voice on/off). The mic glows when idle, pings red while recording and has a gradient level bar. Transcripts and pages fade in. Skeletons replace "Loading…". "Investigating…" is a step list (History → Tickets → Maintenance → SOP → findings) that ticks off from the real `tool_calls` as each finishes, with its measured ms. Stat numbers count up to their real new value, and new dashboard rows flash for 3 s.
- Demo prep: Settings shows the models in use (from `/api/health`) and a dev-only **Reset demo** (needs `ALLOW_DEMO_RESET=true` and `npm run dev`, plus an inline "Yes, reset" confirm). It deletes all incidents and reseeds through the request's DB session, so it is tested on a test DB (42 tests pass). No logic, rules or existing API behaviour changed. The only additions are `/api/dev/reset-demo` and `demo_reset_enabled` in `/api/health`.

**Likely interview question**
- *Q: Isn't the animation just decoration?*
  A: Each one carries information. The alarm banner and beep mark the moment a safety rule escalates. The step list shows which real tool call is running and how long each took. The row flash shows which incident just arrived. Every number shown is real: animations only move between measured values, and confidence is still labelled "model confidence (self-reported)".

## Phase 6.1 (final) + 6.5 follow-ups

- Voice chosen after a listening test: **Urmila, timbre-v2.5** (kept). `TTS_MODEL`/`TTS_VOICE` are set in `.env`, the samples are deleted, and the old cache (Latin-script audio, no longer spoken) was cleared. Re-tested once: the Devanagari acknowledgement took 1.9 s to generate (4.5 s of audio) and is now cached. CLAUDE.md is unchanged because the model is still v2.5.
- The dashboard's own alert is now a compact one-line strip, so it doesn't stack under the slide-in alarm banner on camera.

## Phase 6.2 — Hinglish hardening

**What was built and why**
- `app/text_norm.py`, one normaliser shared by the safety rules and the keyword extractor. It lowercases; unifies Devanagari marks (nukta, chandrabindu, anusvara: धुआँ/धुआं/धुंआ → धुआ); turns punctuation and the danda into spaces; collapses repeated Latin letters (dhuaan → dhuan, aaag → aag); maps common spellings to one form (dhua/dhuwan → dhuan, gais → gas, leek → leak); and maps Hindi helper words (की/से/में…) to Latin so mixed-script phrases match. Keywords pass through the same function, so both sides always agree. The LLM still gets the raw transcript.
- `safety_rules.yaml` now lists romanised and Devanagari variants and short phrases for smoke, gas, sparks/electric shock, fire and burning smell. `except` phrases ("fire extinguisher", "smoke detector") stop routine talk about safety equipment from ringing the alarm. A bare "gas" no longer fires ("gas cylinder ka order"); it needs leak/smell context, and the LLM's `gas_leak` type is a second trigger path. Prisma keyterms got the same danger variants and still stay at 200: aliases with digits go last because Prisma writes digits well, so 126/130 word aliases ("chaudah", "मशीन चौदह", "boiler pump") fit.
- Stress test `tests/test_hinglish_rules.py`: 85 danger sentences (17 per rule; Hinglish, Hindi, English, mixed, misspelled, STT-style) and 20 safe ones. The first pass was 83/85 with 1 false alarm. After the fixes it is **85/85 recall and 0/20 false alarms** on this set. 150 tests pass. Report: `eval/hinglish_text_test.md` (`backend\.venv\Scripts\python eval\run_hinglish_eval.py`).
- Real extractor check (15 LLM requests): **Gemini returned HTTP 429 (rate limit) for 14 of 15**, so only 1 sentence was really extracted by the LLM, and it was correct. The other 14 went through the keyword fallback (14/15 correct), so this run did not measure LLM accuracy. The one failure (`पैकेजिंग मशीन से जलने की बदबू`) was fixed in the fallback: machine names are matched, M-12 has new aliases (synced into the live DB at startup without deleting anything), and "जलने की" counts as smoke. Offline, the fallback now gets 15/15 on those sentences. The same person wrote the sentences and the keyword lists, so treat that as a smoke check.

**Likely interview questions**
- *Q: Why normalise instead of just listing every spelling in the rules?*
  A: Spellings explode: "dhuaan", "dhuaaan" and "dhuwan" differ by STT noise, and Devanagari has several valid ways to write the same nasal sound. One small, tested normaliser applied to both the text and the keywords handles whole families at once, and the explicit keyword lists stay short enough for a reviewer to check.
- *Q: 100% recall — so the rules never miss?*
  A: 100% on our own 85-sentence test set, which I wrote while tuning the rules, so it is a regression test, not a guarantee. Real speech will produce spellings we haven't seen. That's why there are three layers: the rules on the raw transcript, the rules on the LLM's extracted fields, and the LLM's `incident_type` mapped to a rule.
