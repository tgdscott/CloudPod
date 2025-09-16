from __future__ import annotations
from starlette.staticfiles import StaticFiles
from api.core.paths import FINAL_DIR, MEDIA_DIR, FLUBBER_CTX_DIR
import logging
import os
from pathlib import Path

# Writable dirs for Cloud Run (defaults to /tmp, overridable via env)
from pathlib import Path
import os
log = logging.getLogger(__name__)
FINAL_DIR = Path(os.getenv("FINAL_DIR", "/tmp/final_episodes"))
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", "/tmp/media_uploads"))
FLUBBER_DIR = Path(os.getenv("FLUBBER_CONTEXTS_DIR", "/tmp/flubber_contexts"))
for d in (FINAL_DIR, MEDIA_DIR, FLUBBER_DIR):
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log.warning("Could not create static dir %s: %s", d, e)
import logging
import os, logging

import os
from pathlib import Path

log = logging.getLogger(__name__)

# Cloud Run-safe writable defaults under /tmp

for d in (FINAL_DIR, MEDIA_DIR, FLUBBER_DIR):
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log.warning("Could not create static dir %s: %s", d, e)


import api.db_listeners  # registers SQLAlchemy listeners
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from starlette.middleware.sessions import SessionMiddleware

from api.core.config import warn_if_secrets_missing
from api.core.database import engine
from api.core.logging import configure_logging, get_logger
from api.exceptions import install_exception_handlers
from api.limits import limiter, DISABLE as RL_DISABLED

# optional rate-limit middleware
try:
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.errors import RateLimitExceeded
except Exception:  # pragma: no cover
    SlowAPIMiddleware = None  # type: ignore
    RateLimitExceeded = None  # type: ignore

# split-out helpers
from api.startup_tasks import run_startup_tasks, _compute_pt_expiry
from api.routing import attach_routers

# --- logging ASAP ---
configure_logging()
log = get_logger("api.app")

# --- sentry (no-op in dev/test) ---
SENTRY_DSN = os.getenv("SENTRY_DSN")
ENV = os.getenv("APP_ENV") or os.getenv("ENV") or os.getenv("PYTHON_ENV") or "dev"
if SENTRY_DSN and ENV not in ("dev", "development", "test", "testing", "local"):
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[FastApiIntegration(), LoggingIntegration(level=None, event_level=None)],
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
            environment=ENV,
            send_default_pii=False,
        )
        log.info("[startup] Sentry initialized for env=%s", ENV)
    except Exception as se:
        log.warning("[startup] Sentry init failed: %s", se)
else:
    log.info("[startup] Sentry disabled (missing DSN or dev/test env)")

# --- early secrets sanity (warn outside prod; fail in prod) ---
try:
    warn_if_secrets_missing()
except Exception as e:
    if ENV.lower() in ("prod", "production"):
        log.error("Secrets validation failed: %s", e)
        raise
    else:
        log.warning("Secrets validation issues (non-prod): %s", e)

# --- build app ---
app = FastAPI(title="Podcast Pro Plus API")

# DB/tables and additive migrations, backfills, etc.
run_startup_tasks()

# Exceptions & base middlewares
app.add_middleware(SessionMiddleware,
    secret_key=(
        os.getenv("SESSION_SECRET")
        or os.getenv("SESSION_SECRET_KEY")
        or "dev-insecure-session-secret-change-me"
    ),
    session_cookie="ppp_session",
    max_age=60 * 60 * 24 * 14,
    # OAuth flows require the session cookie to be sent on cross-site redirects.
    # Browsers only send cookies on cross-site requests when SameSite=None and Secure flag is set.
    # Set same_site to 'none' and https_only to True in production so state persists during Google OAuth.
    same_site="none",
    https_only=True,
)
app.add_middleware(
    CORSMiddleware,
    # Avoid wildcard '*' when credentials are allowed. Use explicit origins from env.
    # CORS_ALLOWED_ORIGINS may be a comma-separated list, e.g.:
    #   CORS_ALLOWED_ORIGINS=https://app.getpodcastplus.com,https://staging.example
    allow_origins=(os.getenv("CORS_ALLOWED_ORIGINS", "https://app.getpodcastplus.com").split(",")),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Request ID / Security headers
from api.middleware.request_id import RequestIDMiddleware
from api.middleware.security_headers import SecurityHeadersMiddleware
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# --- Diagnostic middleware: log Origin and final CORS response headers ---
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
class ResponseLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        try:
            origin = request.headers.get('origin')
            method = request.method
            path = request.url.path
            log.debug("[CORS-DBG] incoming request method=%s path=%s origin=%s", method, path, origin)
        except Exception:
            pass
        response = await call_next(request)
        try:
            aco = response.headers.get('access-control-allow-origin')
            acc = response.headers.get('access-control-allow-credentials')
            log.debug("[CORS-DBG] response for %s %s: A-C-A-O=%s A-C-A-C=%s request_id=%s", method, path, aco, acc, response.headers.get('x-request-id'))
        except Exception:
            pass
        return response

app.add_middleware(ResponseLoggingMiddleware)

install_exception_handlers(app)

# Rate limiting (if enabled)
if not RL_DISABLED and getattr(limiter, "limit", None):
    app.state.limiter = limiter
    if SlowAPIMiddleware is not None:
        app.add_middleware(SlowAPIMiddleware)
    if RateLimitExceeded is not None:
        async def _rate_limit_handler(request, exc):  # type: ignore
            return JSONResponse(status_code=429, content={"detail": "Too many requests"}, headers={"Retry-After": "60"})
        app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)  # type: ignore

# Ensure static dirs exist (Cloud Run’s FS is ephemeral)
for _d in (FINAL_DIR, MEDIA_DIR, FLUBBER_CTX_DIR):
    try:
        Path(_d).mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log.warning("Could not create static dir %s: %s", _d, e)



# Routers
# Attach routers and get availability map (routing.attach_routers now returns a dict)
try:
    availability = attach_routers(app)
except Exception as e:
    # If attach_routers itself raises, surface the error so startup logs show the
    # failure. In production this should cause the container to fail and restart
    # (so Cloud Run doesn't silently serve the SPA without APIs).
    log.exception("attach_routers threw an exception: %s", e)
    raise

# Log router availability to make missing modules visible in startup logs.
try:
    missing = [k for k, v in availability.items() if not v]
    if missing:
        log.warning("Missing routers at startup: %s", missing)
except Exception:
    log.debug("Could not inspect router availability map")

# Root & health
@app.get("/")
def root():
    # Prefer serving built SPA index.html when available in container (e.g. /app/static_ui)
    try:
        index = STATIC_UI_DIR / "index.html"
        if index.exists():
            return FileResponse(index, media_type="text/html")
    except Exception:
        pass
    return {"ok": True}

@app.get("/api/health")
def api_health_alias():
    return {"status": "ok"}

@app.get("/healthz")
def healthz():
    # liveness: no DB
    return {"ok": True}

@app.get("/readyz")
def readyz():
    # readiness: light DB check
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

# Re-export so legacy imports of api.main:_compute_pt_expiry (via api.app) still work
__all__ = ["app", "_compute_pt_expiry"]


# --- FORCE_TASKS_ROUTER_START ---
# Ensure the tasks router is mounted even if routing.py misses it or startup path differs.
try:
    from api.routers.tasks import router as tasks_router  # type: ignore
except Exception:
    tasks_router = None

def _has_tasks_router(_app) -> bool:
    try:
        for r in getattr(_app, "routes", []):
            if getattr(r, "path", "") == "/api/tasks/transcribe":
                return True
    except Exception:
        pass
    return False

if tasks_router and not _has_tasks_router(app):
    app.include_router(tasks_router)
# --- FORCE_TASKS_ROUTER_END ---


# --- FORCE_TASKS_ENDPOINT_START ---
# A direct /api/tasks/transcribe endpoint to guarantee presence on every boot.
import os, logging
from fastapi import Header, HTTPException, Request
from pydantic import BaseModel

class _TasksTranscribeIn(BaseModel):
    filename: str

@app.post("/api/tasks/transcribe", include_in_schema=True, tags=["tasks"])
async def __force_tasks_transcribe(req: Request, payload: _TasksTranscribeIn, x_tasks_auth: str | None = Header(None)):
    if x_tasks_auth != os.getenv("TASKS_AUTH"):
        raise HTTPException(status_code=401, detail="unauthorized")
    logging.info(
        "event=tasks.transcribe.start filename=%s request_id=%s",
        payload.filename, req.headers.get("x-request-id")
    )
    try:
        from api.services.transcription import transcribe_media_file
        transcribe_media_file(payload.filename)
        logging.info(
            "event=tasks.transcribe.done filename=%s request_id=%s",
            payload.filename, req.headers.get("x-request-id")
        )
        return {"queued": False, "started": True}
    except Exception as e:
        logging.exception("event=tasks.transcribe.error filename=%s err=%s", payload.filename, e)
        # Bubble a clear error but don't crash the process
        raise HTTPException(status_code=500, detail="transcription-start-failed")
# --- FORCE_TASKS_ENDPOINT_END ---

# --- PPP autogenerated static mounts ---
try:
    # Ensure static dirs exist (Cloud Run FS is per-instance & ephemeral)
    for _d in (FINAL_DIR, MEDIA_DIR, FLUBBER_CTX_DIR):
        try:
            Path(_d).mkdir(parents=True, exist_ok=True)
        except Exception as e:
            log.warning("Could not create static dir %s: %s", _d, e)

    # Static mounts
    app.mount("/static/final",   StaticFiles(directory=str(FINAL_DIR),       check_dir=False), name="final")
    app.mount("/static/media",   StaticFiles(directory=str(MEDIA_DIR),       check_dir=False), name="media")
    app.mount("/static/flubber", StaticFiles(directory=str(FLUBBER_CTX_DIR), check_dir=False), name="flubber")
except Exception as _e:
    # Ensure `log` exists; earlier in this module we initialize logging but if
    # that failed for some reason, create a fallback logger here.
    if 'log' not in globals():
        import logging as _logging
        log = _logging.getLogger(__name__)
    log.warning("Static mounts init skipped: %s", _e)
# --- end PPP autogenerated static mounts ---

# Serve built SPA (if present in container at /app/static_ui)
from pathlib import Path
STATIC_UI_DIR = Path(os.getenv("STATIC_UI_DIR", "/app/static_ui"))
 

# Ensure the users router is present. In production we prefer fail-fast rather
# than silently serving the SPA when critical API routes are missing. The
# routing.attach_routers() call above returns an availability map.
if not availability.get('users', False):
    # In non-prod environments we keep serving but log warnings. In prod, treat
    # this as a fatal startup error so the system operator (or our CI) notices
    # and a deployment can be fixed.
    if ENV.lower() in ("prod", "production"):
        log.error("Critical router 'users' missing in production; failing startup")
        raise RuntimeError("Critical router 'users' missing at startup")
    else:
        log.warning("Users router missing; falling back to temporary 401 handler (non-prod)")

        @app.get('/api/users/me')
        def __fallback_users_me_nonprod():
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})


# Catch-all to serve SPA files after API routers are attached.
# Placed after attach_routers so API endpoints (e.g. /api/*) take priority.
@app.get("/{full_path:path}")
async def spa_catch_all(full_path: str):
    # If request is for API, let the router handle it (this route is after routers so it only runs for unmatched paths)
    try:
        # If path begins with api (or other reserved prefixes) we must not return
        # the SPA index.html — return 404 instead. This avoids returning HTML
        # where JSON is expected (client-side JSON.parse errors).
        if full_path.startswith("api") or full_path.startswith("static"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        # serve file if exists
        candidate = STATIC_UI_DIR / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        # serve index.html fallback for SPA routes
        index = STATIC_UI_DIR / "index.html"
        if index.exists():
            return FileResponse(index, media_type="text/html")
    except Exception:
        pass
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
