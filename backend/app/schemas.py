"""Request and response shapes for the API (Pydantic)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Severity = Literal["low", "medium", "high", "critical"]
Status = Literal["open", "acknowledged", "in_progress", "resolved"]
IncidentType = Literal["smoke", "gas_leak", "sparks_fire", "vibration", "noise", "oil_leak", "overheating", "other"]


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
    escalated: bool
    severity_source: str | None
    confidence: float | None  # self-reported by the LLM, not measured
    related_incident_id: str | None
    created_at: datetime


class IncidentDetailOut(IncidentOut):
    llm_severity: str | None
    extractor: str | None
    extracted: dict | None
    rule_hits: list[dict]
    investigation: dict | None
    duplicate_status: str | None
    merged_into: str | None
    events: list[EventOut]


class IncidentCreate(BaseModel):
    machine_id: str | None = None
    incident_type: IncidentType
    severity: Severity  # what the worker confirmed; the server still applies the safety rules
    symptoms: list[str] = []
    transcript: str = ""  # the RAW transcript (rules run on it again on the server)
    language: str | None = None
    related_incident_id: str | None = None
    analysis: dict | None = None  # the /api/incidents/extract response the worker confirmed


class StatusUpdate(BaseModel):
    status: Status
    note: str = ""


class DuplicateDecision(BaseModel):
    action: Literal["merge", "keep_separate"]


class ExtractRequest(BaseModel):
    transcript: str
