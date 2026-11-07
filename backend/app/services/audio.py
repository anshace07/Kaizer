"""Audio helpers: find ffmpeg and turn any upload (webm, mp3, m4a...) into 16 kHz mono WAV.

Prisma does not accept webm (what browsers record), so everything goes through ffmpeg first.
"""
import glob
import io
import os
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

MAX_SECONDS = 28  # Prisma's hard limit is 30 s; we keep a small safety margin.


class AudioError(Exception):
    """Bad or unusable audio. The message is safe to show to the user."""


def find_ffmpeg() -> str:
    """Return the path to ffmpeg.

    Order: FFMPEG_PATH env var -> PATH -> the PATH saved in the Windows registry (a terminal opened
    before ffmpeg was installed has a stale PATH) -> the default winget install folder.
    """
    if os.getenv("FFMPEG_PATH"):
        return os.environ["FFMPEG_PATH"]
    if found := shutil.which("ffmpeg"):
        return found

    if os.name == "nt":
        import winreg

        saved_path = []
        for root, key in [(winreg.HKEY_CURRENT_USER, "Environment"),
                          (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")]:
            try:
                with winreg.OpenKey(root, key) as k:
                    saved_path.append(winreg.QueryValueEx(k, "Path")[0])
            except OSError:
                pass
        if found := shutil.which("ffmpeg", path=os.path.expandvars(";".join(saved_path))):
            return found
        pattern = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\*FFmpeg*\*\bin\ffmpeg.exe")
        if matches := glob.glob(pattern):
            return matches[0]

    raise AudioError("ffmpeg not found. Install it (winget install Gyan.FFmpeg) or set FFMPEG_PATH in backend/.env.")


def to_wav_16k_mono(audio: bytes, filename: str = "upload") -> bytes:
    """Convert any audio ffmpeg understands into 16 kHz, mono, 16-bit WAV bytes."""
    if not audio:
        raise AudioError("The audio file is empty.")

    suffix = Path(filename).suffix or ".bin"  # ffmpeg sniffs the real format; the suffix is only a hint
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / f"in{suffix}", Path(tmp) / "out.wav"
        src.write_bytes(audio)
        cmd = [find_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
               "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-map_metadata", "-1", "-fflags", "+bitexact",
               str(dst)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 or not dst.exists():
            raise AudioError(f"Could not read this audio file ({filename}). Is it a real audio recording?")
        return dst.read_bytes()


def wav_seconds(wav: bytes) -> float:
    with wave.open(io.BytesIO(wav)) as w:
        return w.getnframes() / w.getframerate()


def prepare(audio: bytes, filename: str = "upload") -> tuple[bytes, float]:
    """Convert and check length. Returns (wav_bytes, seconds)."""
    wav = to_wav_16k_mono(audio, filename)
    seconds = wav_seconds(wav)
    if seconds < 0.1:
        raise AudioError("The recording is empty or too short.")
    if seconds > MAX_SECONDS:
        raise AudioError(f"The recording is {seconds:.1f} s long. Please keep it under {MAX_SECONDS} s.")
    return wav, seconds
