from pathlib import Path
from typing import Any, Dict, List

import pytest

from api.services.transcription.transcription_runner import run_assemblyai_job


class FakeResponse:
    def __init__(self, status_code: int, payload: Dict[str, Any]):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self) -> Dict[str, Any]:
        return dict(self._payload)


def test_runner_happy_path(tmp_path, monkeypatch, caplog):
    caplog.set_level("INFO")
    # Create a fake audio file
    audio = tmp_path / "sample.wav"
    audio.write_bytes(b"RIFF....WAVE")

    calls: List[str] = []

    # Monkeypatch HTTP layer used by client so client logging runs
    def fake_post(url, headers=None, data=None, json=None):
        if url.endswith("/upload"):
            calls.append("post_upload")
            headers = headers or {}
            assert headers.get("authorization") == "k"
            return FakeResponse(200, {"upload_url": "https://mock/upload/123"})
        elif url.endswith("/transcript"):
            calls.append("post_transcript")
            headers = headers or {}
            json = json or {}
            assert headers.get("authorization") == "k"
            assert json.get("audio_url") == "https://mock/upload/123"
            return FakeResponse(200, {"id": "job_1", "status": "queued"})
        raise AssertionError(f"Unexpected POST url: {url}")

    seq = [
        {"status": "processing"},
        {"status": "completed", "text": "hi", "words": [{"text": "hi", "start": 0, "end": 1000}]},
    ]

    def fake_get(url, headers=None):
        headers = headers or {}
        assert headers.get("authorization") == "k"
        assert url.endswith("/transcript/job_1")
        calls.append("get_poll")
        return FakeResponse(200, seq.pop(0))

    monkeypatch.setattr("requests.post", fake_post)
    monkeypatch.setattr("requests.get", fake_get)

    # Avoid delays
    monkeypatch.setattr("time.sleep", lambda s: None)

    cfg = {
        "api_key": "k",
        "base_url": "https://mock",
        "polling": {"interval_s": 0.01, "timeout_s": 5, "backoff": 1.0},
        "params": {"speaker_labels": False},
    }
    log: List[str] = []

    out = run_assemblyai_job(audio, cfg, log)

    # Order of HTTP calls (upload -> create -> poll*2)
    assert calls == ["post_upload", "post_transcript", "get_poll", "get_poll"]

    # Result normalized
    assert isinstance(out, dict)
    assert list(out.keys()) == ["words"]
    assert out["words"][0]["word"] == "hi"
    assert out["words"][0]["start"] == 0
    assert out["words"][0]["end"] == 1.0

    # Log lines present from client/runner
    msgs = "\n".join(r.getMessage() for r in caplog.records)
    assert "[assemblyai] payload=" in msgs
    assert "[assemblyai] created transcript id=" in msgs
    assert "[assemblyai] server flags" in msgs
