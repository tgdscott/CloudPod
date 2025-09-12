import os
import pytest


@pytest.mark.skipif(os.getenv("DISABLE_RATE_LIMITS") == "1", reason="rate limits disabled via env")
def test_ai_title_rate_limited(client):
    # Exceed the limit of 10/minute set on /api/ai/title
    payload = {
        "episode_id": 1,
        "podcast_id": 1,
        "transcript_path": __file__,  # any existing path to bypass TRANSCRIPT_NOT_READY
    }
    last = None
    status_codes = []
    for i in range(12):
        r = client.post("/api/ai/title", json=payload)
        status_codes.append(r.status_code)
        last = r
        # Stop early if we already saw 429 (some implementations trip at 11th call)
        if r.status_code == 429:
            break
    assert 429 in status_codes, f"expected 429 in {status_codes}"
    assert last is not None
    if last.status_code == 429:
        assert last.json().get("detail") in ("Too many requests", "Rate limit exceeded")
        assert "Retry-After" in (last.headers or {})
