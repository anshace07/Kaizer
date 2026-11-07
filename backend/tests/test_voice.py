"""Voice tests: Timbre and the LLM are always faked (see conftest.py)."""
from datetime import datetime, timezone

from app import llm
from app.models import Incident
from app.services import announce, tts


class FakeTimbre:
    """Stands in for GnaniTTSClient and counts real-looking calls."""
    calls = []

    def __init__(self, api_key=None, timeout=None):
        assert api_key == "test-key"

    def synthesize(self, text, voice=None, **kwargs):
        FakeTimbre.calls.append({"text": text, "voice": voice, **kwargs})
        return b"RIFF-fake-wav"


def use_fake_timbre(monkeypatch):
    FakeTimbre.calls = []
    monkeypatch.setattr(tts, "GnaniTTSClient", FakeTimbre)


def incident(machine_id="M-14", incident_type="smoke", severity="critical", iid="INC-3001", status="open"):
    return Incident(id=iid, machine_id=machine_id, incident_type=incident_type, severity=severity, status=status,
                    symptoms=[], transcript="", escalated=severity == "critical", rule_hits=[],
                    created_at=datetime.now(timezone.utc))


# ---------- acknowledgement (fixed template, no LLM) ----------

def test_acknowledgement_template():
    assert announce.acknowledgement_text(incident()) == \
        "Report mil gaya. Machine 14 par dhuan — Critical alert bhej diya gaya hai."
    assert announce.acknowledgement_text(incident("M-06", "vibration", "medium")).startswith(
        "Report mil gaya. Machine 6 par zyada vibration")


def test_spoken_text_never_says_m_14():
    assert tts.spoken_text("M-14 aur M40 aur M-05 check karo") == "Machine 14 aur Machine 40 aur Machine 5 check karo"


# ---------- TTS service ----------

def test_speak_uses_timbre_v25_hindi_and_caches(monkeypatch):
    use_fake_timbre(monkeypatch)
    first = tts.speak("Report mil gaya.")
    second = tts.speak("Report mil gaya.")
    assert len(FakeTimbre.calls) == 1  # same sentence never costs twice
    assert (first["cached"], second["cached"]) == (False, True)
    call = FakeTimbre.calls[0]
    assert call["model"] == "timbre-v2.5" and call["language"] == "hi-IN" and call["voice"] == "Urmila"
    assert tts.audio_path(first["audio_id"]).read_bytes() == b"RIFF-fake-wav"


def test_voice_comes_from_env(monkeypatch):
    use_fake_timbre(monkeypatch)
    monkeypatch.setenv("TTS_VOICE", "Deepak")
    tts.speak("Namaste")
    assert FakeTimbre.calls[0]["voice"] == "Deepak"


def test_tts_failure_never_blocks():
    result = tts.try_speak("Report mil gaya.")  # conftest makes Timbre fail
    assert result["audio_id"] is None and result["text"] == "Report mil gaya." and result["error"]


def test_fix_wav_header_writes_real_sizes():
    import io, struct, wave
    pcm = bytes([0, 1]) * 22050  # 1 s of 16-bit mono at 22050 Hz
    streaming = (b"RIFF" + struct.pack("<I", 0xFFFFFFFF) + b"WAVE" + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 22050, 44100, 2, 16)
                 + b"data" + struct.pack("<I", 0xFFFFFFFF) + pcm)
    with wave.open(io.BytesIO(tts.fix_wav_header(streaming))) as w:
        assert w.getnframes() / w.getframerate() == 1.0


def test_audio_path_rejects_bad_ids():
    assert tts.audio_path("../../.env") is None


# ---------- handover summary ----------

def add(factory, *incidents):
    with factory() as db:
        db.query(Incident).delete()
        db.add_all(incidents)
        db.commit()


def test_handover_uses_llm_summary_when_valid(monkeypatch, session_factory):
    add(session_factory, incident(), incident("M-06", "vibration", "medium", "INC-3002"))
    text = "Do open incidents. Machine 14 par dhuan, critical. Machine 6 par vibration, medium."
    monkeypatch.setattr(llm, "chat_json", lambda messages: {"summary": text, "_llm_ms": 5})
    with session_factory() as db:
        result = announce.handover_summary(db)
    assert result["text"] == text and result["summary_by"].startswith("llm:")
    assert result["incident_ids"] == ["INC-3001", "INC-3002"]  # critical first


def test_handover_rejects_invented_machine_or_too_long(monkeypatch, session_factory):
    add(session_factory, incident())
    with session_factory() as db:
        monkeypatch.setattr(llm, "chat_json", lambda m: {"summary": "Machine 14 aur Machine 9 par dhuan."})
        invented = announce.handover_summary(db)
        monkeypatch.setattr(llm, "chat_json", lambda m: {"summary": "Machine 14 " + "bahut " * 70})
        too_long = announce.handover_summary(db)
    assert invented["summary_by"] == "template" and "Machine 9" in invented["fallback_reason"]
    assert too_long["summary_by"] == "template" and too_long["word_count"] <= 60


def test_handover_template_when_llm_down_skips_resolved(session_factory):
    add(session_factory, incident("M-06", "noise", "low", "INC-3002"), incident(),
        incident("M-09", "overheating", "high", "INC-3003", status="resolved"))
    with session_factory() as db:
        result = announce.handover_summary(db)  # conftest blocks the real LLM
    assert result["summary_by"] == "template"
    assert result["text"] == "Abhi 2 open incidents hain. Machine 14 par dhuan, critical. Machine 6 par ajeeb awaaz, low."


def test_template_groups_repeats_and_keeps_whole_sentences(session_factory):
    many = [incident(iid=f"INC-40{n:02d}") for n in range(5)]  # 5 x Machine 14 smoke critical
    many += [incident(f"M-{n:02d}", "noise", "low", f"INC-41{n:02d}") for n in range(1, 13)]
    text = announce.template_summary(many)
    assert "Machine 14 par dhuan, critical — 5 reports." in text
    assert len(text.split()) <= 60 and text.endswith("Baaki list screen par hai.")


# ---------- endpoints ----------

def test_announce_endpoint_speaks_template(monkeypatch, client):
    use_fake_timbre(monkeypatch)
    created = client.post("/api/incidents", json={"machine_id": "M-14", "incident_type": "smoke",
                                                  "severity": "critical", "transcript": "Machine 14 mein dhuan"}).json()
    res = client.post(f"/api/incidents/{created['id']}/announce").json()
    assert res["text"] == "Report mil gaya. Machine 14 par dhuan — Critical alert bhej diya gaya hai."
    assert client.get(res["audio_url"]).content == b"RIFF-fake-wav"


def test_announce_endpoint_returns_text_when_tts_fails(client):
    created = client.post("/api/incidents", json={"machine_id": "M-14", "incident_type": "smoke",
                                                  "severity": "critical", "transcript": "dhuan"}).json()
    res = client.post(f"/api/incidents/{created['id']}/announce").json()
    assert res["audio_url"] is None and res["tts_error"] and res["text"].startswith("Report mil gaya.")
