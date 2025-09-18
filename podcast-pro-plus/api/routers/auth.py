from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from jose import JWTError, jwt
from authlib.integrations.starlette_client import OAuth
from sqlmodel import Session

from ..core.config import settings
import logging
import httpx
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
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# --- OAuth Client Setup ---
def _build_oauth_client() -> tuple[OAuth, str]:
    """Construct a new OAuth client registered for Google."""
    o = OAuth()
    o.register(
        name='google',
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        client_kwargs={'scope': 'openid email profile'},
    )
    return o, settings.GOOGLE_CLIENT_ID

# --- Helper Functions ---
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Creates a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# --- Dependency for getting current user ---
async def get_current_user(
    request: Request, session: Session = Depends(get_session), token: str = Depends(oauth2_scheme)
) -> User:
    """Decodes the JWT token to get the current user."""
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
        user_in.is_active = bool(getattr(admin_settings, 'default_user_active', True))
    except Exception:
        user_in.is_active = True
    user = crud.create_user(session=session, user_create=user_in)
    admin_email = getattr(settings, 'ADMIN_EMAIL', '')
    if admin_email and user.email and user.email.lower() == admin_email.lower():
        user.is_admin = True
        session.add(user)
        session.commit()
        session.refresh(user)
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
    admin_email = getattr(settings, 'ADMIN_EMAIL', '')
    if admin_email and user.email and user.email.lower() == admin_email.lower():
        user.is_admin = True
    user.last_login = datetime.utcnow()
    session.add(user)
    session.commit()

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    """Request body for JSON-based login."""
    email: EmailStr
    password: str


@router.post("/login", response_model=dict)
async def login_for_access_token_json(
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> dict:
    """Login user with email/password from a JSON body."""
    user = crud.get_user_by_email(session=session, email=payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    admin_email = getattr(settings, 'ADMIN_EMAIL', '')
    if admin_email and user.email and user.email.lower() == admin_email.lower():
        user.is_admin = True
    user.last_login = datetime.utcnow()
    session.add(user)
    session.commit()

    access_token = create_access_token(data={"sub": user.email})
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
    backend_base = settings.OAUTH_BACKEND_BASE or "https://api.getpodcastplus.com"
    redirect_uri = f"{backend_base}/api/auth/google/callback"
    oauth_client, _ = _build_oauth_client()
    return await oauth_client.google.authorize_redirect(request, redirect_uri)

@router.get('/google/callback')
async def auth_google_callback(request: Request, session: Session = Depends(get_session)):
    """Handles the callback from Google, creates/updates the user, and redirects."""
    try:
        oauth_client, _ = _build_oauth_client()
        token = await oauth_client.google.authorize_access_token(request)
    except Exception as e:
        logger.exception("Google OAuth token exchange failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate Google credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    google_user_data = token.get('userinfo')
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
        try:
            admin_settings = load_admin_settings(session)
            user_create.is_active = bool(getattr(admin_settings, 'default_user_active', True))
        except Exception:
            user_create.is_active = True
        user = crud.create_user(session=session, user_create=user_create)

    admin_email = getattr(settings, 'ADMIN_EMAIL', '')
    if admin_email and user.email and user.email.lower() == admin_email.lower():
        user.is_admin = True

    if not user.google_id:
        user.google_id = google_user_data['sub']
    
    user.last_login = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    access_token = create_access_token(data={"sub": user.email})

    frontend_url = f"https://app.getpodcastplus.com/#access_token={access_token}&token_type=bearer"
    if user.is_admin:
        frontend_url = f"https://app.getpodcastplus.com/admin#access_token={access_token}&token_type=bearer"
    
    return RedirectResponse(url=frontend_url)

# --- User Test Endpoint ---
@router.get("/users/me", response_model=UserPublic)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Gets the details of the currently logged-in user."""
    data = current_user.model_dump()
    admin_email = getattr(settings, 'ADMIN_EMAIL', '')
    is_admin = bool(admin_email and current_user.email and current_user.email.lower() == admin_email.lower())
    data.update({"is_admin": is_admin})
    return UserPublic(**data)

# --- Debug endpoint ---
@router.get("/debug/google-client", include_in_schema=False)
async def debug_google_client():
    """Reveals what Google client settings are active."""
    def _mask(val: str | None) -> str:
        v = (val or "").strip()
        return (v[:8] + "…" if len(v) > 8 else v) if v else ""

    backend_base = settings.OAUTH_BACKEND_BASE or "https://api.getpodcastplus.com"
    return {
        "client_id_hint": _mask(settings.GOOGLE_CLIENT_ID),
        "redirect_uri": f"{backend_base}/api/auth/google/callback",
        "oauth_backend_base_is_set": bool(settings.OAUTH_BACKEND_BASE),
    }
