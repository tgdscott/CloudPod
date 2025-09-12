from pathlib import Path

try:
    from pydub import AudioSegment
except Exception:  # Fallback to a tiny bytes file if pydub is unavailable
    AudioSegment = None  # type: ignore

def _write_minimal_wav(p: Path) -> None:
    # Minimal 44-byte WAV header for PCM, 8kHz, mono, 16-bit, no data
    riff = (
        b"RIFF"
        + (36).to_bytes(4, "little")
        + b"WAVEfmt "
        + (16).to_bytes(4, "little")
        + (1).to_bytes(2, "little")  # PCM
        + (1).to_bytes(2, "little")  # mono
        + (8000).to_bytes(4, "little")  # sample rate
        + (8000 * 2).to_bytes(4, "little")  # byte rate
        + (2).to_bytes(2, "little")  # block align
        + (16).to_bytes(2, "little")  # bits per sample
        + b"data"
        + (0).to_bytes(4, "little")
    )
    p.write_bytes(riff)

def make_tiny_wav(path: str | Path, ms: int = 500) -> None:
    """Create a tiny WAV file at the given path.

    If pydub is present, uses AudioSegment.silent to create a silent WAV of the given length.
    Falls back to a minimal RIFF/WAVE header if pydub export is unavailable or produces no file.
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if AudioSegment is not None:
        try:
            seg = AudioSegment.silent(duration=int(ms))
            # Some test stubs of pydub return bytes and do not write to disk; attempt export then verify.
            try:
                seg.export(p.as_posix(), format="wav")
            except Exception:
                # Ignore and fallback below
                pass
            # If export didn't create a file, fallback to minimal header
            if not p.exists() or p.stat().st_size == 0:
                _write_minimal_wav(p)
            return
        except Exception:
            # Fallback if pydub path fails for any reason
            _write_minimal_wav(p)
            return
    # No pydub available: write minimal header
    _write_minimal_wav(p)
