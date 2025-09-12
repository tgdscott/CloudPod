from importlib import import_module
from pathlib import Path
from fastapi.testclient import TestClient


def _load_app():
    # Import main app module via package path (conftest sets sys.path)
    mod = import_module('api.main')
    return getattr(mod, 'app')


def test_security_headers_present():
    app = _load_app()
    client = TestClient(app)
    r = client.get('/api/health')
    assert r.status_code == 200
    h = r.headers
    assert "Content-Security-Policy" in h
    assert h.get("Content-Security-Policy", "").startswith("default-src 'self'")
    assert h.get("Strict-Transport-Security") == "max-age=15552000; includeSubDomains"
    assert h.get("X-Content-Type-Options") == "nosniff"
    assert h.get("X-Frame-Options") == "DENY"
    assert h.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert h.get("Permissions-Policy") == "camera=(), microphone=()"