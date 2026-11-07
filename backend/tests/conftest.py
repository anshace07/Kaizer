"""Shared test setup. No test may reach a real LLM or the real database."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import llm
from app.db import Base, get_db


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    """Any un-mocked LLM call fails like an outage instead of going over the network."""
    def blocked(*args, **kwargs):
        raise llm.LLMError("real LLM is blocked in tests")
    monkeypatch.setattr(llm, "_client", blocked)


@pytest.fixture(autouse=True)
def no_real_tts(monkeypatch, tmp_path):
    """Timbre is never called for real, and test audio goes to a temp folder, not backend/cache."""
    from gnani.tts.exceptions import GnaniTTSError
    from app.services import tts

    class Blocked:
        def __init__(self, *args, **kwargs):
            raise GnaniTTSError("real Timbre is blocked in tests")
    monkeypatch.setattr(tts, "GnaniTTSClient", Blocked)
    monkeypatch.setattr(tts, "CACHE_DIR", tmp_path / "tts")
    monkeypatch.setenv("GNANI_API_KEY", "test-key")


@pytest.fixture
def session_factory():
    """A fresh in-memory database with the synthetic seed data."""
    from app.seed import seed
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        seed(db)
    return factory


@pytest.fixture
def client(session_factory):
    """API client wired to the in-memory database (including the background investigation)."""
    from app.main import app, get_session_factory

    def test_db():
        with session_factory() as db:
            yield db
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    yield TestClient(app)
    app.dependency_overrides.clear()
