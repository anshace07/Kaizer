"""PlantPulse AI backend — FastAPI routes.

Start (from the backend folder): uvicorn app.main:app --reload --port 8000
"""

import os
from collections import Counter
from contextlib import asynccontextmanager
from datetime import timedelta, timezone

from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from . import llm
from .agent.investigate import run_investigation
from .db import BACKEND_DIR, SessionLocal, get_db
from .models import Incident, IncidentEvent, Machine, now_utc
from .safety import rules
from .schemas import (
    DuplicateDecision,
    ExtractRequest,
    TTSRequest,
    IncidentCreate,
    IncidentDetailOut,
    IncidentOut,
    MachineOut,
    Severity,
    Status,
    StatusUpdate,
)
from .seed import reset_demo, seed_if_empty
from .services import announce, audio, extract, stt, tts


load_dotenv(BACKEND_DIR / ".env")

STT_MODEL = stt.MODEL


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_if_empty()
    yield


app = FastAPI(
    title="PlantPulse AI",
    description="All data is synthetic.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def get_incident_or_404(db: Session, incident_id: str) -> Incident:
    inc = db.get(Incident, incident_id)

    if inc is None:
        raise HTTPException(
            404,
            f"Incident {incident_id} not found",
        )

    return inc


def get_session_factory():
    """The background investigation opens its own DB sessions."""
    return SessionLocal


DUPLICATE_WINDOW = timedelta(minutes=10)


def recent_report_for_machine(
    db: Session,
    machine_id: str | None,
) -> Incident | None:
    """Find the newest incident for the same machine within 10 minutes."""

    if not machine_id:
        return None

    latest = (
        db.query(Incident)
        .filter(
            Incident.machine_id == machine_id,
            Incident.merged_into.is_(None),
        )
        .order_by(Incident.created_at.desc())
        .first()
    )

    if latest is None:
        return None

    created = (
        latest.created_at
        if latest.created_at.tzinfo
        else latest.created_at.replace(tzinfo=timezone.utc)
    )

    return (
        latest
        if now_utc() - created <= DUPLICATE_WINDOW
        else None
    )


def next_incident_id(db: Session) -> str:
    numbers = [
        int(incident_id.split("-")[1])
        for (incident_id,) in db.query(Incident.id)
        if incident_id.startswith("INC-")
        and incident_id.split("-")[1].isdigit()
    ]

    return f"INC-{max(numbers, default=1000) + 1}"


def demo_reset_enabled() -> bool:
    return os.getenv("ALLOW_DEMO_RESET", "").lower() == "true"


def machine_list(db: Session) -> list[dict]:
    return [
        {
            "id": machine.id,
            "name": machine.name,
            "location": machine.location,
            "aliases": machine.aliases,
        }
        for machine in db.query(Machine).order_by(Machine.id)
    ]


# --------------------------------------------------
# DEVELOPMENT
# --------------------------------------------------

@app.post("/api/dev/reset-demo")
def reset_demo_data(db: Session = Depends(get_db)):
    """DEV ONLY: wipe incidents and restore synthetic seed data."""

    if not demo_reset_enabled():
        raise HTTPException(
            403,
            "Demo reset is disabled. Set ALLOW_DEMO_RESET=true "
            "in backend/.env (dev only).",
        )

    reset_demo(db)

    return {
        "incidents": db.query(Incident).count(),
        "machines": db.query(Machine).count(),
    }


# --------------------------------------------------
# HEALTH
# --------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "data": "synthetic",
        "stt_model": STT_MODEL,
        "tts_model": tts.model(),
        "tts_voice": tts.voice(),
        "llm_model": llm.model_name(),
        "llm_fallback_model": llm.fallback_model_name(),
        "llm_max_rpm": int(
            os.getenv("LLM_MAX_RPM") or llm.DEFAULT_MAX_RPM
        ),
        "demo_reset_enabled": demo_reset_enabled(),
    }


# --------------------------------------------------
# AUDIO TRANSCRIPTION
# --------------------------------------------------

MAX_UPLOAD_BYTES = 15 * 1024 * 1024


@app.post("/api/transcribe")
def transcribe(
    file: UploadFile = File(...),
    language: str = Form("hinglish"),
):
    """Convert common audio formats to WAV and transcribe with Prisma."""

    language_code = stt.LANGUAGE_CODES.get(language)

    if language_code is None:
        raise HTTPException(
            400,
            f"language must be one of {list(stt.LANGUAGE_CODES)}",
        )

    data = file.file.read(MAX_UPLOAD_BYTES + 1)

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            "Audio file is too large (max 15 MB).",
        )

    try:
        wav, seconds = audio.prepare(
            data,
            file.filename or "upload",
        )

        result = stt.transcribe(wav, language_code)

    except audio.AudioError as error:
        raise HTTPException(400, str(error))

    except stt.STTError as error:
        raise HTTPException(error.status, str(error))

    return {
        "transcript": result["transcript"],
        "detected_language_code": result["detected_language_code"],
        "stt_ms": result["stt_ms"],
        "cached": result["cached"],
        "audio_seconds": round(seconds, 1),
    }


# --------------------------------------------------
# MACHINES
# --------------------------------------------------

@app.get("/api/machines", response_model=list[MachineOut])
def list_machines(db: Session = Depends(get_db)):
    return db.query(Machine).order_by(Machine.id).all()


# --------------------------------------------------
# INCIDENT LIST
# --------------------------------------------------

@app.get("/api/incidents", response_model=list[IncidentOut])
def list_incidents(
    status: Status | None = None,
    severity: Severity | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Incident)

    if status:
        query = query.filter(Incident.status == status)

    if severity:
        query = query.filter(Incident.severity == severity)

    return query.order_by(Incident.created_at.desc()).all()


# --------------------------------------------------
# TEXT TO SPEECH
# --------------------------------------------------

def speech(text: str, spoken: str | None = None) -> dict:
    """Return display text and, when available, a Timbre audio URL."""

    result = tts.try_speak(spoken or text)

    return {
        "text": text,
        "spoken_text": result["text"],
        "audio_url": (
            f"/api/tts/{result['audio_id']}"
            if result["audio_id"]
            else None
        ),
        "cached": result["cached"],
        "tts_ms": result["tts_ms"],
        "tts_error": result["error"],
    }


@app.post("/api/tts")
def text_to_speech(body: TTSRequest):
    """Speak a short text, such as a machine confirmation question."""
    return speech(body.text)


@app.get("/api/tts/{audio_id}")
def tts_audio(audio_id: str):
    path = tts.audio_path(audio_id)

    if path is None:
        raise HTTPException(404, "Audio not found")

    return FileResponse(
        path,
        media_type="audio/wav",
    )


# --------------------------------------------------
# INCIDENT ANNOUNCEMENTS
# --------------------------------------------------

@app.post("/api/incidents/{incident_id}/announce")
def announce_incident(
    incident_id: str,
    db: Session = Depends(get_db),
):
    """Spoken acknowledgement from a fixed template."""

    incident = get_incident_or_404(db, incident_id)

    return speech(
        announce.acknowledgement_text(incident),
        announce.acknowledgement_spoken(incident),
    )


@app.post("/api/handover/summary")
def handover_summary(db: Session = Depends(get_db)):
    """Generate a short handover summary and speak it with Timbre."""

    summary = announce.handover_summary(db)

    return {
        **summary,
        **speech(summary["text"], summary["spoken"]),
    }


# --------------------------------------------------
# INCIDENT EXTRACTION
# --------------------------------------------------

# Declared before /api/incidents/{incident_id}.
@app.post("/api/incidents/extract")
def extract_incident(
    body: ExtractRequest,
    db: Session = Depends(get_db),
):
    """Transcript extraction and safety analysis. Saves nothing."""

    if not body.transcript.strip():
        raise HTTPException(400, "Transcript is empty.")

    return extract.analyse(
        body.transcript,
        machine_list(db),
    )


# --------------------------------------------------
# GET INCIDENT DETAILS
# --------------------------------------------------

@app.get(
    "/api/incidents/{incident_id}",
    response_model=IncidentDetailOut,
)
def get_incident(
    incident_id: str,
    db: Session = Depends(get_db),
):
    return get_incident_or_404(db, incident_id)


# --------------------------------------------------
# CREATE INCIDENT
# --------------------------------------------------

@app.post(
    "/api/incidents",
    response_model=IncidentDetailOut,
    status_code=201,
)
def create_incident(
    body: IncidentCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    session_factory=Depends(get_session_factory),
):
    """
    Save the worker-confirmed incident.

    The backend independently:
    - Validates machine selection.
    - Checks that the machine exists.
    - Reapplies deterministic safety rules.
    - Checks for duplicate reports.
    """

    # 1. Read extraction information.
    analysis = body.analysis or {}
    extraction = analysis.get("extraction") or {}

    extractor = analysis.get("extractor") or "manual entry"
    llm_severity = extraction.get("suggested_severity")

    transcript = (body.transcript or "").strip()

    # 2. Recheck machine ambiguity independently.
    available_machines = machine_list(db)

    detected_candidates = (
        extract.detect_machine_candidates(
            transcript,
            available_machines,
        )
        if transcript
        else []
    )

    extraction_candidates = extraction.get("machine_candidates") or []

    known_machine_ids = {
        machine["id"]
        for machine in available_machines
    }

    # Keep only known machine IDs from extraction.
    extraction_candidates = [
        candidate
        for candidate in extraction_candidates
        if candidate in known_machine_ids
    ]

    # Deterministic detection takes priority over LLM candidates.
    candidates = (
        detected_candidates
        if detected_candidates
        else extraction_candidates
    )

    confirmation_required = (
        bool(extraction.get("confirmation_required"))
        or len(candidates) > 1
    )

    # Require a machine selection whenever confirmation is needed.
    if confirmation_required and not body.machine_id:
        raise HTTPException(
            status_code=422,
            detail=(
                "Machine confirmation is required. "
                "Please select the correct machine before "
                "creating the incident."
            ),
        )

    # Do not allow selection outside the detected candidate list.
    if (
        candidates
        and body.machine_id
        and body.machine_id not in candidates
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Invalid machine selection. Please select one "
                "of the suggested machines: "
                + ", ".join(candidates)
            ),
        )

    # 3. Verify that the selected machine exists.
    location = None

    if body.machine_id:
        machine = db.get(Machine, body.machine_id)

        if machine is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown machine {body.machine_id}",
            )

        location = machine.location

    # 4. Verify the related incident, if supplied.
    if body.related_incident_id:
        get_incident_or_404(
            db,
            body.related_incident_id,
        )

    # 5. Reapply deterministic safety rules.
    hits = rules.check(
        transcript,
        body.incident_type,
        body.symptoms,
    )

    # Determine whether the severity being submitted is the
    # severity produced by the earlier extraction analysis.
    if body.severity == analysis.get("severity"):
        suggested_by = (
            analysis.get("severity_decided_by") or "worker"
        )
    else:
        suggested_by = "worker"

    # Deterministic safety rules are reapplied here.
    severity, decided_by = rules.decide_severity(
        body.severity,
        hits,
        suggested_by,
    )

    # 6. Detect possible duplicate incidents.
    duplicate_of = (
        None
        if body.related_incident_id
        else recent_report_for_machine(
            db,
            body.machine_id,
        )
    )

    # 7. Create the incident.
    incident = Incident(
        id=next_incident_id(db),
        location=location,
        status="open",
        machine_id=body.machine_id,
        incident_type=body.incident_type,
        symptoms=body.symptoms,
        transcript=transcript,
        language=body.language,
        related_incident_id=body.related_incident_id,
        severity=severity,
        severity_source=decided_by,
        escalated=bool(hits),
        llm_severity=llm_severity,
        confidence=extraction.get("extraction_confidence"),
        extractor=extractor,
        extracted=analysis or None,
        rule_hits=hits,
    )

    if duplicate_of:
        incident.related_incident_id = duplicate_of.id
        incident.duplicate_status = "pending"

    # 8. Build the incident timeline.
    log = [
        (
            "created",
            f"Incident reported · extractor: {extractor}",
        )
    ]

    if analysis.get("llm_note"):
        log.append(
            ("llm_model", f"LLM: {analysis['llm_note']}")
        )

    if analysis.get("fallback_reason"):
        log.append(
            ("llm_fallback", analysis["fallback_reason"])
        )

    if confirmation_required:
        log.append(
            (
                "worker_confirmed",
                f"Machine confirmation completed. "
                f"Worker selected {body.machine_id}",
            )
        )

    for hit in hits:
        log.append(
            (
                "safety_rule",
                f"Safety rule {hit['rule_id']} triggered: "
                f"{hit['keyword']} (in {hit['source']})",
            )
        )

    log.append(
        (
            "severity",
            f"Final severity {severity} — decided by {decided_by}"
            + (
                f" (LLM suggested {llm_severity})"
                if llm_severity
                else ""
            ),
        )
    )

    if hits:
        log.append(
            (
                "escalated",
                "Escalated · Simulated alert raised "
                "(the app never controls machines)",
            )
        )

    if duplicate_of:
        log.append(
            (
                "related",
                f"Related to {duplicate_of.id} "
                f"(same machine {body.machine_id}, reported "
                "within 10 min) — waiting for supervisor: "
                "merge or keep separate",
            )
        )

    now = now_utc()

    incident.events = [
        IncidentEvent(
            action=action,
            detail=detail,
            timestamp=now + timedelta(microseconds=index),
        )
        for index, (action, detail) in enumerate(log)
    ]

    # 9. Save the incident.
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Run investigation after the response is sent.
    background.add_task(
        run_investigation,
        session_factory,
        incident.id,
    )

    return incident


# --------------------------------------------------
# DUPLICATE INCIDENT DECISION
# --------------------------------------------------

@app.post(
    "/api/incidents/{incident_id}/duplicate",
    response_model=IncidentDetailOut,
)
def decide_duplicate(
    incident_id: str,
    body: DuplicateDecision,
    db: Session = Depends(get_db),
):
    """Supervisor decides whether a possible duplicate is merged."""

    incident = get_incident_or_404(db, incident_id)

    if (
        incident.duplicate_status != "pending"
        or not incident.related_incident_id
    ):
        raise HTTPException(
            400,
            f"{incident_id} is not waiting for a duplicate decision",
        )

    original = get_incident_or_404(
        db,
        incident.related_incident_id,
    )

    if body.action == "merge" and original.status == "resolved":
        raise HTTPException(
            400,
            f"{original.id} is already resolved — "
            "keep this report separate instead",
        )

    if body.action == "keep_separate":
        incident.duplicate_status = "kept_separate"

        incident.events.append(
            IncidentEvent(
                action="duplicate_decision",
                detail=(
                    f"Supervisor kept this separate from {original.id}"
                ),
            )
        )

    else:
        incident.duplicate_status = "merged"
        incident.merged_into = original.id

        old_status = incident.status
        incident.status = "resolved"

        incident.events.append(
            IncidentEvent(
                action="duplicate_decision",
                detail=(
                    f"Merged into {original.id} "
                    f"(status {old_status} -> resolved)"
                ),
            )
        )

        # Never lose an alert by merging.
        order = rules.SEVERITY_ORDER

        if order.index(incident.severity) > order.index(original.severity):
            original.events.append(
                IncidentEvent(
                    action="severity",
                    detail=(
                        f"Severity {original.severity} -> {incident.severity} "
                        f"(from merged report {incident.id})"
                    ),
                )
            )

            original.severity = incident.severity
            original.severity_source = incident.severity_source

        if incident.escalated and not original.escalated:
            original.escalated = True
            original.rule_hits = [
                *(original.rule_hits or []),
                *(incident.rule_hits or []),
            ]

        original.events.append(
            IncidentEvent(
                action="merged",
                detail=(
                    f"Report {incident.id} merged in: "
                    f"\"{incident.transcript}\""
                ),
            )
        )

    db.commit()
    db.refresh(incident)

    return incident


# --------------------------------------------------
# INCIDENT STATUS
# --------------------------------------------------

@app.post(
    "/api/incidents/{incident_id}/status",
    response_model=IncidentDetailOut,
)
def update_status(
    incident_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
):
    incident = get_incident_or_404(db, incident_id)

    old_status = incident.status
    incident.status = body.status

    detail = (
        f"Status {old_status} -> {body.status}"
        + (f": {body.note}" if body.note else "")
    )

    incident.events.append(
        IncidentEvent(
            action="status_changed",
            detail=detail,
        )
    )

    db.commit()
    db.refresh(incident)

    return incident


# --------------------------------------------------
# DASHBOARD STATISTICS
# --------------------------------------------------

@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    """Plain counts from the database — nothing estimated."""

    incidents = db.query(Incident).all()

    unresolved = [
        incident
        for incident in incidents
        if incident.status != "resolved"
    ]

    return {
        "total": len(incidents),
        "unresolved": len(unresolved),
        "critical_unresolved": sum(
            1
            for incident in unresolved
            if incident.severity == "critical"
        ),
        "by_status": Counter(
            incident.status for incident in incidents
        ),
        "by_severity": Counter(
            incident.severity for incident in incidents
        ),
        "unresolved_by_severity": Counter(
            incident.severity for incident in unresolved
        ),
        "by_type": Counter(
            incident.incident_type for incident in incidents
        ),
    }