# Tests

This project uses pytest for backend testing.

## Quick start

- Run all fast unit tests:

```bash
pytest -q
```

By default, tests marked `integration` are skipped.

## Running integration tests

Enable integration tests explicitly using markers:

```bash
pytest -q -m integration
```

Or run both unit and integration tests:

```bash
pytest -q -m "unit or integration"
```

You can also deselect e2e if present:

```bash
pytest -q -m "not e2e"
```

## HTTP mocking policy

All tests run with real HTTP disabled by default. We use `requests-mock` to block outbound requests, while allowing `http://localhost` and `https://localhost` (including `127.0.0.1`) to pass through.

- To stub an external call:

```python
def test_example(requests_mocker):
    requests_mocker.get("https://api.example.com/ping", json={"ok": True})
```

- To allow specific hosts temporarily, use the `allow_http` helper in tests:

```python
def test_calls_stripe(allow_http, requests_mocker):
    allow_http(r"^https://api\\.stripe\\.com")
    requests_mocker.get("https://api.stripe.com/v1/ping", json={"ok": True})
```

## Environment and DB isolation

- Tests set `PPP_ENV=test` and dummy vendor keys for the session.
- Each test uses a temporary SQLite database file; migrations are applied via `create_db_and_tables()`.
- The FastAPI TestClient (`client`) and a SQLModel session (`session`) fixtures are provided.
- Celery runs in eager mode for tests (in-memory broker/backend).

## Paths and discovery

- `testpaths = tests podcast-pro-plus/api/tests`
- `norecursedirs = scripts dist build node_modules venv .venv .git`
- Only files matching `test_*.py` are collected.
