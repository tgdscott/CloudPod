# api/middleware/security_headers.py
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        path = request.url.path

        # Strict default CSP for your app
        default_csp = (
            "default-src 'self'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; "
            "connect-src 'self'; "
            "font-src 'self' data:; "
            "object-src 'none'"
        )

        # Relaxed CSP ONLY for interactive API docs
        docs_csp = (
            "default-src 'self' https://cdn.jsdelivr.net; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "connect-src 'self'; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "object-src 'none'"
        )

        response.headers["Content-Security-Policy"] = (
            docs_csp if path.startswith("/docs") or path.startswith("/redoc") else default_csp
        )

        # Other helpful headers
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

        return response
