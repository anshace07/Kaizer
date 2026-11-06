"""Database tables."""
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now_utc():
    return datetime.now(timezone.utc)


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. "M-14"
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    aliases: Mapped[list] = mapped_column(JSON, default=list)  # spoken names
    next_service_date: Mapped[str | None] = mapped_column(String, nullable=True)  # from maintenance.json


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. "INC-1001"
    machine_id: Mapped[str | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    incident_type: Mapped[str] = mapped_column(String)
    symptoms: Mapped[list] = mapped_column(JSON, default=list)
    transcript: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str | None] = mapped_column(String, nullable=True)
    severity: Mapped[str] = mapped_column(String)  # low / medium / high / critical
    status: Mapped[str] = mapped_column(String, default="open")  # open / acknowledged / in_progress / resolved
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # only set when actually measured
    related_incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    events: Mapped[list["IncidentEvent"]] = relationship(
        back_populates="incident", order_by="IncidentEvent.timestamp", cascade="all, delete-orphan"
    )


class IncidentEvent(Base):
    """Timestamped action log for an incident (created, status changed, alert raised...)."""
    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    action: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default="")

    incident: Mapped[Incident] = relationship(back_populates="events")


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. "TKT-501"
    machine_id: Mapped[str] = mapped_column(ForeignKey("machines.id"))
    title: Mapped[str] = mapped_column(String)
    priority: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    opened_on: Mapped[str] = mapped_column(String)
    assigned_team: Mapped[str] = mapped_column(String)
