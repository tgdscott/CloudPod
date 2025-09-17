from __future__ import annotations
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.staticfiles import StaticFiles
from pydantic import BaseModel

# Load settings early
from api.core.config import settings

# Now, other modules can be imported that might use settings
import api.db_listeners  # registers SQLAlchemy listeners
from api.core.database import engine
from api.core.logging import configure_logging, get_logger
from api.exceptions import install_exception_handlers
from api.limits import limiter, DISABLE as RL_DISABLED
from api.startup_tasks import run_startup_tasks, _compute_pt_expiry
from api.routing import attach_routers

# --- logging ASAP ---
configure_logging()
log = get_logger("api.app")

# --- Writable Dirs Setup ---
FINAL_DIR = Path(os.getenv("FINAL_DIR", "/tmp/final_episodes"))
MEDIA_DIR = Path(settings.MEDIA_ROOT)
FLUBBER_DIR = Path(os.getenv("FLUBBER_CONTEXTS_DIR", "/tmp/flubber_contexts"))
for d in (FINAL_DIR, MEDIA_DIR, FLUBBER_DIR):
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log.warning("Could not create static dir %s: %s", d, e)

# --- Sentry (optional) ---
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

# --- Build App ---
app = FastAPI(title="Podcast Pro Plus API")

# DB/tables and additive migrations
run_startup_tasks()

# --- Middleware ---
app.add_middleware(SessionMiddleware,
    secret_key=settings.SESSION_SECRET_KEY,
    session_cookie="ppp_session",
    max_age=60 * 60 * 24 * 14,
    same_site="none",
    https_only=True,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

from api.middleware.request_id import RequestIDMiddleware
from api.middleware.security_headers import SecurityHeadersMiddleware
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

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
try:
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.errors import RateLimitExceeded
    if not RL_DISABLED and getattr(limiter, "limit", None):
        app.state.limiter = limiter
        app.add_middleware(SlowAPIMiddleware)
        async def _rate_limit_handler(request, exc):  # type: ignore
            return JSONResponse(status_code=429, content={"detail": "Too many requests"}, headers={"Retry-After": "60"})
        app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)  # type: ignore
except Exception: # pragma: no cover
    pass

# --- Routers ---
try:
    availability = attach_routers(app)
    if not availability.get('users', False):
        if ENV.lower() in ("prod", "production"):
            log.error("Critical router 'users' missing in production; failing startup")
            raise RuntimeError("Critical router 'users' missing at startup")
        else:
            log.warning("Users router missing; falling back to temporary 401 handler (non-prod)")
            @app.get('/api/users/me')
            def __fallback_users_me_nonprod():
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
except Exception as e:
    log.exception("attach_routers threw an exception: %s", e)
    raise

# --- Health Checks ---
@app.get("/api/health")
def api_health_alias():
    return {"status": "ok"}

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/readyz")
def readyz():
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

# --- Static Files & SPA ---
STATIC_UI_DIR = Path(os.getenv("STATIC_UI_DIR", "/app/static_ui"))
app.mount("/static/final",   StaticFiles(directory=str(FINAL_DIR),       check_dir=False), name="final")
app.mount("/static/media",   StaticFiles(directory=str(MEDIA_DIR),       check_dir=False), name="media")
app.mount("/static/flubber", StaticFiles(directory=str(FLUBBER_DIR), check_dir=False), name="flubber")

@app.get("/{full_path:path}")
async def spa_catch_all(full_path: str):
    if full_path.startswith(("api/", "static/")):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    try:
        candidate = STATIC_UI_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        index = STATIC_UI_DIR / "index.html"
        if index.exists():
            return FileResponse(index, media_type="text/html")
    except Exception:
        pass
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
