"""PlantPulse AI backend — FastAPI routes.

Start (from the backend folder):  uvicorn app.main:app --reload --port 8000
"""
import os
from collections import Counter
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import fake_extractor
from .db import BACKEND_DIR, get_db
from .models import Incident, IncidentEvent, Machine
from .schemas import (ExtractOut, ExtractRequest, IncidentCreate, IncidentDetailOut, IncidentOut, MachineOut,
                      Severity, Status, StatusUpdate)
from .seed import seed_if_empty

load_dotenv(BACKEND_DIR / ".env")

STT_MODEL = "prisma-v3.0"
TTS_MODEL = "timbre-v2.5"


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


def next_incident_id(db: Session) -> str:
    numbers = [int(i.split("-")[1]) for (i,) in db.query(Incident.id)]
    return f"INC-{max(numbers, default=1000) + 1}"


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "data": "synthetic",
        "stt_model": STT_MODEL,
        "tts_model": TTS_MODEL,
        "llm_model": os.getenv("LLM_MODEL") or "not configured",
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


# Declared before /api/incidents/{incident_id} routes so "extract" is never read as an id.
@app.post("/api/incidents/extract", response_model=ExtractOut)
def extract_incident(body: ExtractRequest, db: Session = Depends(get_db)):
    """TEMPORARY keyword matcher. The real LLM extractor arrives in Phase 4."""
    machines = [{"id": m.id, "aliases": m.aliases} for m in db.query(Machine)]
    return fake_extractor.extract(body.transcript, machines)


@app.get("/api/incidents/{incident_id}", response_model=IncidentDetailOut)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    return get_incident_or_404(db, incident_id)


@app.post("/api/incidents", response_model=IncidentDetailOut, status_code=201)
def create_incident(body: IncidentCreate, db: Session = Depends(get_db)):
    location = None
    if body.machine_id:
        machine = db.get(Machine, body.machine_id)
        if machine is None:
            raise HTTPException(400, f"Unknown machine {body.machine_id}")
        location = machine.location
    if body.related_incident_id:
        get_incident_or_404(db, body.related_incident_id)

    inc = Incident(id=next_incident_id(db), location=location, status="open", **body.model_dump())
    inc.events.append(IncidentEvent(action="created", detail="Incident reported"))
    db.add(inc)
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
