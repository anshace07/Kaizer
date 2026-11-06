"""Load synthetic data from data/*.json into SQLite and add 6 past incidents.

Run directly to wipe and re-seed:  python -m app.seed
The server also calls seed_if_empty() on startup.
"""
import json
from datetime import datetime, timedelta, timezone

from .db import DATA_DIR, Base, SessionLocal, engine
from .models import Incident, IncidentEvent, Machine, Ticket

# Synthetic past incidents: (machine, type, severity, status, days_ago, transcript, language, symptoms, related)
PAST_INCIDENTS = [
    ("M-05", "fluid_leak", "medium", "resolved", 9, "Press machine ke neeche oil phail raha hai.", "hinglish",
     ["oil on floor"], None),
    ("M-13", "smoke_overheating", "critical", "resolved", 6, "LT panel se jalne ki smell aa rahi hai.", "hinglish",
     ["burning smell"], None),
    ("M-03", "vibration_noise", "medium", "in_progress", 4, "Cooling tower fan is rattling loudly.", "english",
     ["rattling noise"], None),
    ("M-09", "high_temperature", "high", "acknowledged", 2, "भट्टी का दरवाज़ा बहुत गरम है।", "hindi",
     ["hot door casing"], None),
    ("M-13", "sparks_fire", "critical", "open", 1, "Panel M13 mein phir se chingari dikhi.", "hinglish",
     ["sparks"], "INC-1002"),
    ("M-14", "fluid_leak", "low", "open", 0, "Boiler pump ke gland se thoda paani aa raha hai.", "hinglish",
     ["water leak at gland"], None),
]

STATUS_STEPS = ["open", "acknowledged", "in_progress", "resolved"]


def load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def seed(db):
    next_service = {row["machine_id"]: row["next_service"] for row in load("maintenance.json")["maintenance"]}
    for m in load("machines.json")["machines"]:
        db.add(Machine(id=m["id"], name=m["name"], type=m["type"], location=m["location"],
                       aliases=m["aliases"], next_service_date=next_service.get(m["id"])))
    for t in load("tickets.json")["tickets"]:
        db.add(Ticket(**t))
    db.flush()

    locations = {m.id: m.location for m in db.query(Machine)}
    now = datetime.now(timezone.utc)
    for i, (mid, itype, sev, status, days_ago, text, lang, symptoms, related) in enumerate(PAST_INCIDENTS):
        created = now - timedelta(days=days_ago, hours=2)
        inc = Incident(id=f"INC-{1001 + i}", machine_id=mid, location=locations[mid], incident_type=itype,
                       symptoms=symptoms, transcript=text, language=lang, severity=sev, status=status,
                       related_incident_id=related, created_at=created)
        inc.events.append(IncidentEvent(timestamp=created, action="created",
                                        detail="Synthetic past incident (seed data)"))
        # One log entry per status step the incident has gone through, 20 minutes apart.
        for step, s in enumerate(STATUS_STEPS[1:STATUS_STEPS.index(status) + 1], start=1):
            inc.events.append(IncidentEvent(timestamp=created + timedelta(minutes=20 * step),
                                            action="status_changed", detail=f"Status set to {s}"))
        db.add(inc)
    db.commit()


def seed_if_empty():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.query(Machine).count() == 0:
            seed(db)


def reset_and_seed():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)


if __name__ == "__main__":
    reset_and_seed()
    print("Database reset and seeded with synthetic data.")
