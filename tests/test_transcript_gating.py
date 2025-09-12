import time
import uuid
from pathlib import Path

# Compute transcripts directory from workspace root to avoid import-time coupling
WS_ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = WS_ROOT / "transcripts"


def _compute_sleep_ms(resp_json, resp_headers, fallback_ms: int = 50) -> int:
    """Return how long (in ms) the client should wait before polling again.

    Prefers any server-provided guidance if present. Falls back to a small
    minimum interval to avoid hammering when guidance isn't provided.
    """
    # JSON field variants (future-proof): next_check_after_{ms|s} or camelCase
    for k in ("next_check_after_ms", "nextCheckAfterMs"):
        if isinstance(resp_json, dict) and isinstance(resp_json.get(k), (int, float)):
            return int(resp_json[k])
    for k in ("next_check_after_s", "nextCheckAfterSec", "nextCheckAfterS"):
        if isinstance(resp_json, dict) and isinstance(resp_json.get(k), (int, float)):
            return int(float(resp_json[k]) * 1000)

    # Header standard: Retry-After (seconds)
    ra = resp_headers.get("Retry-After") if isinstance(resp_headers, dict) else None
    if ra is not None:
        try:
            return max(int(float(ra) * 1000), fallback_ms)
        except Exception:
            pass

    return fallback_ms


def test_transcript_polling_gated_and_ready_after_materialization(client):
    # Unique stem to isolate from any real files
    stem = f"gating_{uuid.uuid4().hex[:8]}"
    txt_path = TRANSCRIPTS_DIR / f"{stem}.txt"
    json_path = TRANSCRIPTS_DIR / f"{stem}.json"
    # Ensure a clean slate
    for p in (txt_path, json_path, TRANSCRIPTS_DIR / f"ai_{stem}.tmp.txt"):
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass

    try:
        # 1) First poll: should not be ready
        r1 = client.get(f"/api/ai/transcript-ready?hint={stem}")
        assert r1.status_code == 200
        j1 = r1.json()
        assert j1.get("ready") is False
        assert j1.get("transcript_path") in (None, "")
        sleep_ms = _compute_sleep_ms(j1, r1.headers, fallback_ms=50)
        time.sleep(sleep_ms / 1000.0)

        # 2) Second poll (still before any completion): should remain not ready
        r2 = client.get(f"/api/ai/transcript-ready?hint={stem}")
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2.get("ready") is False
        assert j2.get("transcript_path") in (None, "")
        time.sleep(_compute_sleep_ms(j2, r2.headers, fallback_ms=50) / 1000.0)

        # Simulate background worker completion by materializing a transcript file
        TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        txt_path.write_text("hello world from transcript", encoding="utf-8")

        # 3) Next poll after min interval: should flip to ready and return path
        r3 = client.get(f"/api/ai/transcript-ready?hint={stem}")
        assert r3.status_code == 200
        j3 = r3.json()
        assert j3.get("ready") is True
        p = j3.get("transcript_path")
        assert isinstance(p, str) and p.endswith(f"{stem}.txt"), f"unexpected path: {p}"
        # Path should exist on disk
        assert Path(p).is_file()
    finally:
        # Cleanup
        for p in (txt_path, json_path, TRANSCRIPTS_DIR / f"ai_{stem}.tmp.txt"):
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass
