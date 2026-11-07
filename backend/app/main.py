"""PlantPulse AI backend — FastAPI routes.

Start (from the backend folder):  uvicorn app.main:app --reload --port 8000
"""
from collections import Counter
from contextlib import asynccontextmanager
from datetime import timedelta, timezone

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from . import llm
from .agent.investigate import run_investigation
from .db import BACKEND_DIR, SessionLocal, get_db
from .models import Incident, IncidentEvent, Machine, now_utc
from .safety import rules
from .schemas import (DuplicateDecision, ExtractRequest, TTSRequest, IncidentCreate, IncidentDetailOut, IncidentOut, MachineOut, Severity, Status,
                      StatusUpdate)
from .seed import seed_if_empty
from .services import announce, audio, extract, stt, tts

load_dotenv(BACKEND_DIR / ".env")

STT_MODEL = stt.MODEL


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_if_empty()  # first run creates the database and loads synthetic data
    yield


app = FastAPI(title="PlantPulse AI", description="All data is synthetic.", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_incident_or_404(db: Session, incident_id: str) -> Incident:
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise HTTPException(404, f"Incident {incident_id} not found")
    return inc


def get_session_factory():
    """The background investigation opens its own DB sessions (tests swap this out)."""
    return SessionLocal


DUPLICATE_WINDOW = timedelta(minutes=10)


def recent_report_for_machine(db: Session, machine_id: str | None) -> Incident | None:
    """The newest incident for the same machine reported in the last 10 minutes, if any."""
    if not machine_id:
        return None
    latest = (db.query(Incident).filter(Incident.machine_id == machine_id, Incident.merged_into.is_(None))
              .order_by(Incident.created_at.desc()).first())
    if latest is None:
        return None
    created = latest.created_at if latest.created_at.tzinfo else latest.created_at.replace(tzinfo=timezone.utc)
    return latest if now_utc() - created <= DUPLICATE_WINDOW else None


def next_incident_id(db: Session) -> str:
    numbers = [int(i.split("-")[1]) for (i,) in db.query(Incident.id)]
    return f"INC-{max(numbers, default=1000) + 1}"


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "data": "synthetic",
        "stt_model": STT_MODEL,
        "tts_model": tts.model(),
        "tts_voice": tts.voice(),
        "llm_model": llm.model_name(),
    }


MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # a 28 s recording is far smaller than this


# Plain `def` (not async): FastAPI runs it in a worker thread, so ffmpeg and the Prisma call don't block others.
@app.post("/api/transcribe")
def transcribe(file: UploadFile = File(...), language: str = Form("hinglish")):
    """Any common audio (webm from the browser, wav, mp3, m4a, ogg...) -> 16 kHz mono WAV -> Prisma.

    `language` comes from the Report page chips: hindi / english / hinglish.
    """
    language_code = stt.LANGUAGE_CODES.get(language)
    if language_code is None:
        raise HTTPException(400, f"language must be one of {list(stt.LANGUAGE_CODES)}")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Audio file is too large (max 15 MB).")
    try:
        wav, seconds = audio.prepare(data, file.filename or "upload")
        result = stt.transcribe(wav, language_code)
    except audio.AudioError as e:
        raise HTTPException(400, str(e))
    except stt.STTError as e:
        raise HTTPException(e.status, str(e))
    return {
        "transcript": result["transcript"],
        "detected_language_code": result["detected_language_code"],
        "stt_ms": result["stt_ms"],  # measured time of the real Prisma call (also for cached results)
        "cached": result["cached"],
        "audio_seconds": round(seconds, 1),
    }


@app.get("/api/machines", response_model=list[MachineOut])
def list_machines(db: Session = Depends(get_db)):
    return db.query(Machine).order_by(Machine.id).all()


@app.get("/api/incidents", response_model=list[IncidentOut])
def list_incidents(status: Status | None = None, severity: Severity | None = None, db: Session = Depends(get_db)):
    q = db.query(Incident)
    if status:
        q = q.filter(Incident.status == status)
    if severity:
        q = q.filter(Incident.severity == severity)
    return q.order_by(Incident.created_at.desc()).all()


def speech(text: str, spoken: str | None = None) -> dict:
    """Screen `text` + (if Timbre worked) a URL to the audio of `spoken` (Devanagari version, if given).
    Never raises: the UI always shows the text."""
    result = tts.try_speak(spoken or text)
    return {"text": text, "spoken_text": result["text"],
            "audio_url": f"/api/tts/{result['audio_id']}" if result["audio_id"] else None,
            "cached": result["cached"], "tts_ms": result["tts_ms"], "tts_error": result["error"]}


@app.post("/api/tts")
def text_to_speech(body: TTSRequest):
    """Speak a short text (e.g. the confirmation question). Cached by text."""
    return speech(body.text)


@app.get("/api/tts/{audio_id}")
def tts_audio(audio_id: str):
    path = tts.audio_path(audio_id)
    if path is None:
        raise HTTPException(404, "Audio not found")
    return FileResponse(path, media_type="audio/wav")


@app.post("/api/incidents/{incident_id}/announce")
def announce_incident(incident_id: str, db: Session = Depends(get_db)):
    """Spoken acknowledgement from a FIXED template (no LLM): 'Report mil gaya. Machine 14 par dhuan — ...'"""
    inc = get_incident_or_404(db, incident_id)
    return speech(announce.acknowledgement_text(inc), announce.acknowledgement_spoken(inc))


@app.post("/api/handover/summary")
def handover_summary(db: Session = Depends(get_db)):
    """LLM writes a <=60-word Hinglish summary of open incidents (template if it fails), then Timbre speaks it."""
    summary = announce.handover_summary(db)
    return {**summary, **speech(summary["text"], summary["spoken"])}


def machine_list(db: Session) -> list[dict]:
    return [{"id": m.id, "name": m.name, "location": m.location, "aliases": m.aliases}
            for m in db.query(Machine).order_by(Machine.id)]


# Declared before /api/incidents/{incident_id} routes so "extract" is never read as an id.
@app.post("/api/incidents/extract")
def extract_incident(body: ExtractRequest, db: Session = Depends(get_db)):
    """Transcript -> LLM extraction (keyword fallback if the LLM fails) + safety rules. Saves nothing."""
    if not body.transcript.strip():
        raise HTTPException(400, "Transcript is empty.")
    return extract.analyse(body.transcript, machine_list(db))


@app.get("/api/incidents/{incident_id}", response_model=IncidentDetailOut)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    return get_incident_or_404(db, incident_id)


@app.post("/api/incidents", response_model=IncidentDetailOut, status_code=201)
def create_incident(body: IncidentCreate, background: BackgroundTasks, db: Session = Depends(get_db),
                    session_factory=Depends(get_session_factory)):
    """Save what the worker confirmed. The safety rules run AGAIN here on the raw transcript and the
    final fields, so neither the LLM nor an edit on the Confirm screen can lower a rule-triggered alert."""
    location = None
    if body.machine_id:
        machine = db.get(Machine, body.machine_id)
        if machine is None:
            raise HTTPException(400, f"Unknown machine {body.machine_id}")
        location = machine.location
    if body.related_incident_id:
        get_incident_or_404(db, body.related_incident_id)

    analysis = body.analysis or {}
    extraction = analysis.get("extraction") or {}
    extractor = analysis.get("extractor") or "manual entry"
    llm_severity = extraction.get("suggested_severity")

    hits = rules.check(body.transcript, body.incident_type, body.symptoms)
    if body.severity == analysis.get("severity"):  # worker kept the suggestion
        suggested_by = analysis.get("severity_decided_by") or "worker"
    else:
        suggested_by = "worker"
    severity, decided_by = rules.decide_severity(body.severity, hits, suggested_by)

    # Possible duplicate: same machine within 10 minutes. Linked, never auto-merged — the supervisor decides.
    duplicate_of = None if body.related_incident_id else recent_report_for_machine(db, body.machine_id)

    inc = Incident(
        id=next_incident_id(db), location=location, status="open",
        machine_id=body.machine_id, incident_type=body.incident_type, symptoms=body.symptoms,
        transcript=body.transcript, language=body.language, related_incident_id=body.related_incident_id,
        severity=severity, severity_source=decided_by, escalated=bool(hits), llm_severity=llm_severity,
        confidence=extraction.get("extraction_confidence"), extractor=extractor,
        extracted=analysis or None, rule_hits=hits,
    )
    if duplicate_of:
        inc.related_incident_id = duplicate_of.id
        inc.duplicate_status = "pending"
    # Timeline: every step is a timestamped event, so the decision can be audited later.
    log = [("created", f"Incident reported · extractor: {extractor}")]
    if analysis.get("fallback_reason"):
        log.append(("llm_fallback", analysis["fallback_reason"]))
    if extraction.get("confirmation_required"):
        log.append(("worker_confirmed", f"Asked: \"{extraction.get('confirmation_question')}\" → worker chose "
                                        f"{body.machine_id or 'no machine'}"))
    for h in hits:
        log.append(("safety_rule", f"Safety rule {h['rule_id']} triggered: {h['keyword']} (in {h['source']})"))
    log.append(("severity", f"Final severity {severity} — decided by {decided_by}"
                            + (f" (LLM suggested {llm_severity})" if llm_severity else "")))
    if hits:
        log.append(("escalated", "Escalated · Simulated alert raised (the app never controls machines)"))
    if duplicate_of:
        log.append(("related", f"Related to {duplicate_of.id} (same machine {body.machine_id}, reported within "
                               "10 min) — waiting for supervisor: merge or keep separate"))
    now = now_utc()  # one clock reading + 1 µs steps keeps the timeline in this exact order
    inc.events = [IncidentEvent(action=a, detail=d, timestamp=now + timedelta(microseconds=i))
                  for i, (a, d) in enumerate(log)]

    db.add(inc)
    db.commit()
    db.refresh(inc)
    # Runs after the response is sent, so creating an incident stays fast.
    background.add_task(run_investigation, session_factory, inc.id)
    return inc


@app.post("/api/incidents/{incident_id}/duplicate", response_model=IncidentDetailOut)
def decide_duplicate(incident_id: str, body: DuplicateDecision, db: Session = Depends(get_db)):
    """Supervisor's choice for a possible duplicate. Merging can only RAISE the original's severity."""
    inc = get_incident_or_404(db, incident_id)
    if inc.duplicate_status != "pending" or not inc.related_incident_id:
        raise HTTPException(400, f"{incident_id} is not waiting for a duplicate decision")
    original = get_incident_or_404(db, inc.related_incident_id)
    if body.action == "merge" and original.status == "resolved":
        raise HTTPException(400, f"{original.id} is already resolved — keep this report separate instead")

    if body.action == "keep_separate":
        inc.duplicate_status = "kept_separate"
        inc.events.append(IncidentEvent(action="duplicate_decision",
                                        detail=f"Supervisor kept this separate from {original.id}"))
    else:
        inc.duplicate_status, inc.merged_into, old_status = "merged", original.id, inc.status
        inc.status = "resolved"
        inc.events.append(IncidentEvent(action="duplicate_decision",
                                        detail=f"Merged into {original.id} (status {old_status} -> resolved)"))
        # Never lose an alert by merging: the original takes the higher severity and any rule hits.
        order = rules.SEVERITY_ORDER
        if order.index(inc.severity) > order.index(original.severity):
            original.events.append(IncidentEvent(action="severity",
                                                 detail=f"Severity {original.severity} -> {inc.severity} "
                                                        f"(from merged report {inc.id})"))
            original.severity, original.severity_source = inc.severity, inc.severity_source
        if inc.escalated and not original.escalated:
            original.escalated = True
            original.rule_hits = [*(original.rule_hits or []), *inc.rule_hits]
        original.events.append(IncidentEvent(action="merged",
                                             detail=f"Report {inc.id} merged in: \"{inc.transcript}\""))
    db.commit()
    db.refresh(inc)
    return inc


@app.post("/api/incidents/{incident_id}/status", response_model=IncidentDetailOut)
def update_status(incident_id: str, body: StatusUpdate, db: Session = Depends(get_db)):
    inc = get_incident_or_404(db, incident_id)
    old = inc.status
    inc.status = body.status
    detail = f"Status {old} -> {body.status}" + (f": {body.note}" if body.note else "")
    inc.events.append(IncidentEvent(action="status_changed", detail=detail))
    db.commit()
    db.refresh(inc)
    return inc


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    """Plain counts from the database — nothing estimated."""
    incidents = db.query(Incident).all()
    unresolved = [i for i in incidents if i.status != "resolved"]
    return {
        "total": len(incidents),
        "unresolved": len(unresolved),
        "critical_unresolved": sum(1 for i in unresolved if i.severity == "critical"),
        "by_status": Counter(i.status for i in incidents),
        "by_severity": Counter(i.severity for i in incidents),
        "unresolved_by_severity": Counter(i.severity for i in unresolved),  # dashboard Critical / High cards
        "by_type": Counter(i.incident_type for i in incidents),
    }
