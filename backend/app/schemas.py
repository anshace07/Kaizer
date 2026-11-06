"""Request and response shapes for the API (Pydantic)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Severity = Literal["low", "medium", "high", "critical"]
Status = Literal["open", "acknowledged", "in_progress", "resolved"]
IncidentType = Literal[
    "smoke_overheating", "gas_leak", "sparks_fire", "vibration_noise", "fluid_leak", "high_temperature", "other"
]


class MachineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    type: str
    location: str
    aliases: list[str]
    next_service_date: str | None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    timestamp: datetime
    action: str
    detail: str


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    machine_id: str | None
    location: str | None
    incident_type: str
    symptoms: list[str]
    transcript: str
    language: str | None
    severity: str
    status: str
    confidence: float | None
    related_incident_id: str | None
    created_at: datetime


class IncidentDetailOut(IncidentOut):
    events: list[EventOut]


class IncidentCreate(BaseModel):
    machine_id: str | None = None
    incident_type: IncidentType
    severity: Severity
    symptoms: list[str] = []
    transcript: str = ""
    language: str | None = None
    related_incident_id: str | None = None


class StatusUpdate(BaseModel):
    status: Status
    note: str = ""


class ExtractRequest(BaseModel):
    transcript: str


class ExtractOut(BaseModel):
    machine_id: str | None
    incident_type: str
    severity: str
    symptoms: list[str]
    language: str
    matched_keywords: list[str]
    extractor: str
