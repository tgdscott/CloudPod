import hmac
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlmodel import Session
import requests
from urllib.parse import urlencode

import os
from api.core.config import settings
from api.core.database import get_session
from api.routers.auth import get_current_user, create_access_token
from api.models.user import User
from jose import jwt, JWTError
from sqlmodel import select
from api.core import crud

router = APIRouter(prefix="/auth/spreaker", tags=["spreaker-oauth"])

def _make_state(user: User) -> str:
    raw = str(user.id)
    sig = hmac.new(settings.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{raw}:{sig}"

def _verify_state(state: str) -> str:
    try:
        raw, sig = state.split(":", 1)
        expect = hmac.new(settings.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()[:16]
        if hmac.compare_digest(sig, expect):
            return raw
    except Exception:
        pass
    raise HTTPException(status_code=400, detail="Invalid state")

import logging
log = logging.getLogger(__name__)

_APP_BASE_URL = (os.getenv("APP_BASE_URL") or "https://app.getpodcastplus.com").rstrip("/")
if not _APP_BASE_URL:
    _APP_BASE_URL = "https://app.getpodcastplus.com"
_SPREAKER_SUCCESS_REDIRECT = f"{_APP_BASE_URL}/dashboard?spreaker_connected=true"

@router.get("/start")
def spreaker_oauth_start(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user)
):
    """Initiate Spreaker OAuth. Accepts Bearer auth OR ?access_token=<jwt> for popup flows.
    Adds verbose logging + graceful HTML when unauthenticated so popup shows actionable info.
    """
    user = current_user
    authed_via = None
    if user is not None:
        authed_via = "dependency"
    if user is None:
        # Fallback: try query param token
        token = request.query_params.get("access_token")
        if token:
            try:
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
                email = payload.get("sub")
                if email:
                    user = crud.get_user_by_email(session=session, email=email)
                    if user:
                        authed_via = "query_token"
            except JWTError as je:
                log.warning(f"[spreaker_oauth.start] JWT decode failed: {je}")
    if user is None:
        log.info("[spreaker_oauth.start] Unauthenticated request. Headers: %s Query: %s", dict(request.headers), dict(request.query_params))
        return HTMLResponse("""
<!DOCTYPE html><html><body style='font-family:sans-serif;padding:1rem'>
<h3>Authentication Required</h3>
<p>The popup couldn't identify your logged-in session.</p>
<ul style='font-size:0.9em'>
  <li>Make sure you're logged in on the main app tab.</li>
  <li>Popup URL should include an <code>access_token</code> query parameter.</li>
  <li>If issue persists, refresh the main app then retry.</li>
  <li>Check server logs for tag <code>[spreaker_oauth.start]</code>.</li>
 </ul>
 <script>setTimeout(()=>{ window.close(); }, 6000);</script>
</body></html>""", status_code=401)
    log.info(f"[spreaker_oauth.start] Authenticated via {authed_via}; user_id={user.id}")
    if not settings.SPREAKER_CLIENT_ID or settings.SPREAKER_CLIENT_ID.startswith("YOUR_"):
        raise HTTPException(status_code=500, detail="Spreaker OAuth not configured on server")
    state = _make_state(user)
    params = {
        "client_id": settings.SPREAKER_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.SPREAKER_REDIRECT_URI,
        "state": state,
    }
    url = f"https://api.spreaker.com/oauth2/authorize?{urlencode(params)}"
    return RedirectResponse(url)

@router.get("/callback")
def spreaker_oauth_callback(code: str, state: str, session: Session = Depends(get_session)):
    """Handle Spreaker redirect, exchange code for tokens, store on user, return closing popup script."""
    user_id = _verify_state(state)
    from api.models.user import User  # noqa
    user: User | None = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found for state")
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.SPREAKER_REDIRECT_URI,
        "client_id": settings.SPREAKER_CLIENT_ID,
        "client_secret": settings.SPREAKER_CLIENT_SECRET,
    }
    try:
        r = requests.post("https://api.spreaker.com/oauth2/token", data=data, timeout=30)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token request failed: {e}")
    if r.status_code // 100 != 2:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {r.status_code} {r.text}")
    tok = r.json()
    access = tok.get("access_token")
    refresh = tok.get("refresh_token")
    if not access:
        raise HTTPException(status_code=500, detail="No access_token in response")
    user.spreaker_access_token = access
    if refresh:
        user.spreaker_refresh_token = refresh
    session.add(user)
    session.commit()
    html = f"""
<!DOCTYPE html><html><body style='font-family:sans-serif;'>
<h3>Spreaker Connected</h3>
<p>You can close this window and return to the app.</p>
<script>
  (function() {
    const target = "{_SPREAKER_SUCCESS_REDIRECT}";
    function notify() {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'spreaker_connected' }, '*');
        }
      } catch (err) {}
    }
    function closeOrRedirect() {
      notify();
      let closed = false;
      try {
        window.close();
        closed = window.closed;
      } catch (err) {}
      if (!closed) {
        window.location.href = target;
      }
    }
    setTimeout(closeOrRedirect, 400);
  })();
</script>
</body></html>
"""
    return HTMLResponse(content=html, status_code=200)
