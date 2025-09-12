import re
from fastapi.testclient import TestClient
from api.main import app
from api.routers.auth import get_current_user


def test_old_ai_metadata_sanitizes_hex_and_audio_junk(monkeypatch):
    # Bypass auth for this test
    class _Dummy:
        pass
    app.dependency_overrides[get_current_user] = lambda: _Dummy()
    client = TestClient(app)

    # Filename with hashes + audio junk
    fname = "456779837bc544b099e40d696cf87e1b 5c3483534233349f7b27e9b16b5821ced stereo mix.wav"

    # Hit the old heuristic endpoint
    resp = client.post(
        "/api/episodes/ai/metadata",
        json={
            "audio_filename": fname,
            "max_tags": 20,
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Title must not contain hex-like ids or 'stereo mix'
    assert not re.search(r"\b[a-f0-9]{16,}\b", data["title"], re.I)
    assert "stereo" not in data["title"].lower()
    assert "mix" not in data["title"].lower()

    # Tags should not include hex-like tokens
    for t in data["tags"]:
        assert not re.search(r"\b[a-f0-9]{16,}\b", t, re.I)
        # Tags must be <= 30 chars and alnum+space only
        assert len(t) <= 30
        assert re.fullmatch(r"[A-Za-z0-9 ]+", t)
    # Cleanup dependency override
    app.dependency_overrides.pop(get_current_user, None)
