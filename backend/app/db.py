"""Database connection. One SQLite file, by default next to the backend folder.

PLANTPULSE_DB_PATH can point it elsewhere (Docker puts it on a named volume so data survives restarts).
"""
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR.parent / "data"
DB_PATH = Path(os.getenv("PLANTPULSE_DB_PATH") or BACKEND_DIR / "plantpulse.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# check_same_thread=False lets FastAPI use the connection from different threads.
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: open a session per request and always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
