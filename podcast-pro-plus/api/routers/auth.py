from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from jose import JWTError, jwt
from authlib.integrations.starlette_client import OAuth
from sqlmodel import Session

from ..core.config import settings
import os
import logging, os
from ..core.security import verify_password
from ..models.user import User, UserCreate, UserPublic
from ..core.database import get_session
from ..core import crud
from ..models.settings import load_admin_settings

# --- Router Setup ---
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

# --- Security Scheme ---
# This tells FastAPI how to find the token (in the "Authorization: Bearer <token>" header)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# --- OAuth Client Setup ---
oauth = OAuth()
oauth.register(
    name='google',
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    client_kwargs={
        'scope': 'openid email profile'
    }
)

# --- Helper Functions ---
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Creates a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# --- Dependency for getting current user ---
async def get_current_user(
    session: Session = Depends(get_session), token: str = Depends(oauth2_scheme)
) -> User:
    """
    Decodes the JWT token to get the current user. This is our bouncer.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if not isinstance(email, str) or not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = crud.get_user_by_email(session=session, email=email)
    if user is None:
        raise credentials_exception
    return user

# --- Standard Authentication Endpoints ---
@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register_user(user_in: UserCreate, session: Session = Depends(get_session)):
    """Register a new user with email and password."""
    db_user = crud.get_user_by_email(session=session, email=user_in.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )
    # Apply admin default activation toggle
    try:
        admin_settings = load_admin_settings(session)
        desired_active = bool(getattr(admin_settings, 'default_user_active', True))
    except Exception:
        desired_active = True
    try:
        # Construct a mutable copy with desired is_active
        data = user_in.model_dump()
        data['is_active'] = desired_active
        user_create = UserCreate(**data)
    except Exception:
        # Fallback to original if something odd occurs
        user_create = user_in
    user = crud.create_user(session=session, user_create=user_create)
    return user

@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    session: Session = Depends(get_session)
):
    """Login user with email/password and return an access token."""
    user = crud.get_user_by_email(session=session, email=form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Update last_login
    user.last_login = datetime.utcnow()
    session.add(user)
    session.commit()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- User preference updates (first_name, last_name, timezone) ---
from pydantic import BaseModel
from typing import Optional

class UserPrefsPatch(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    timezone: Optional[str] = None

@router.patch("/users/me/prefs", response_model=UserPublic)
async def patch_user_prefs(payload: UserPrefsPatch, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    changed = False
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip() or None
        changed = True
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip() or None
        changed = True
    if payload.timezone is not None:
        # Basic sanity: must contain a '/' to look like IANA (e.g., America/Los_Angeles) unless 'UTC'
        tz = payload.timezone.strip()
        if tz and tz != 'UTC' and '/' not in tz:
            raise HTTPException(status_code=400, detail='Invalid timezone format')
        current_user.timezone = tz or None
        changed = True
    if changed:
        session.add(current_user)
        session.commit()
        session.refresh(current_user)
    return current_user

# --- Google OAuth Endpoints ---
@router.get('/login/google')
async def login_google(request: Request):
    """Redirects the user to Google's login page."""
    # Force backend host for redirect to avoid dev-server (5173) host confusing callback/state.
    # If you set OAUTH_BACKEND_BASE (e.g. http://127.0.0.1:8000) we use that, else derive.
    backend_base = os.getenv("OAUTH_BACKEND_BASE") or "http://127.0.0.1:8000"
    redirect_uri = f"{backend_base}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)  # type: ignore[attr-defined]

@router.get('/google/callback')
async def auth_google_callback(request: Request, session: Session = Depends(get_session)):
    """Handles the callback from Google, creates/updates the user, issues a token, and redirects.
    Reverted to original simple implementation (no extra diagnostics) to restore prior working behavior.
    """
    try:
        token = await oauth.google.authorize_access_token(request)  # type: ignore[attr-defined]
    except Exception as e:
        # Preserve original behavior, add optional debug detail
        logger.exception("Google OAuth token exchange failed")
        if e.__class__.__name__ == 'MismatchingStateError':
            logger.error("Hint: State mismatch. Causes: (1) Session cookie not persisted (check SESSION_SECRET / domain / SameSite), (2) Mixed localhost vs 127.0.0.1, (3) Multiple tabs reusing old state, (4) Browser blocked third-party cookies.")
        detail = "Could not validate Google credentials. See server logs for details."
        if os.getenv("GOOGLE_OAUTH_DEBUG") == "1":
            detail = f"Could not validate Google credentials: {e.__class__.__name__}: {e}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )

    google_user_data = token.get('userinfo') if isinstance(token, dict) else None
    if not google_user_data:
        raise HTTPException(status_code=400, detail="Could not fetch user info from Google.")

    user_email = google_user_data['email']
    user = crud.get_user_by_email(session=session, email=user_email)

    if not user:
        user_create = UserCreate(
            email=user_email,
            password=str(uuid4()),
            google_id=google_user_data['sub']
        )
        # Apply admin default activation toggle for first-time Google signups
        try:
            admin_settings = load_admin_settings(session)
            desired_active = bool(getattr(admin_settings, 'default_user_active', True))
        except Exception:
            desired_active = True
        try:
            user_create.is_active = desired_active
        except Exception:
            # In case of validation/frozen model issues, rebuild
            try:
                data = user_create.model_dump()
                data['is_active'] = desired_active
                user_create = UserCreate(**data)
            except Exception:
                pass
        user = crud.create_user(session=session, user_create=user_create)
    elif not user.google_id:
        user.google_id = google_user_data['sub']
        session.add(user)
        session.commit()
        session.refresh(user)
    # Record last_login for Google auth
    try:
        user.last_login = datetime.utcnow()
        session.add(user)
        session.commit()
    except Exception:
        logger.warning("Failed updating last_login for user %s", user.email)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    frontend_url = f"https://app.getpodcastplus.com/#access_token={access_token}&token_type=bearer"
    return RedirectResponse(url=frontend_url)

# --- User Test Endpoint ---
@router.get("/users/me", response_model=UserPublic)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Gets the details of the currently logged-in user.
    This is a protected endpoint.
    """
    # Enrich with admin flags without mutating DB
    data = current_user.model_dump()
    is_admin = bool(current_user.email and current_user.email.lower() == settings.ADMIN_EMAIL.lower())
    data.update({
        "is_admin": is_admin,
        "role": "admin" if is_admin else None,
    })
    return UserPublic(**data)

# Backward-compatible alias for older frontends: /auth/users/me -> same handler
@router.get("/auth/users/me", response_model=UserPublic)
async def read_users_me_alias(current_user: User = Depends(get_current_user)):
    return await read_users_me(current_user)  # type: ignore[misc]