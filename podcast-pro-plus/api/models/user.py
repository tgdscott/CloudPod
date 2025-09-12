from sqlmodel import SQLModel, Field, Relationship
from pydantic import EmailStr
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional, List

# Forward reference to avoid circular import errors
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .podcast import PodcastTemplate

class UserBase(SQLModel):
    """Base model with shared fields."""
    email: EmailStr = Field(unique=True, index=True)
    is_active: bool = True
    google_id: Optional[str] = Field(default=None, unique=True)
    tier: str = Field(default="free")
    spreaker_access_token: Optional[str] = Field(default=None)
    spreaker_refresh_token: Optional[str] = Field(default=None)
    elevenlabs_api_key: Optional[str] = Field(default=None)
    stripe_customer_id: Optional[str] = Field(default=None, index=True)
    # JSON-encoded user-level audio cleanup & command settings (serialized externally)
    audio_cleanup_settings_json: Optional[str] = Field(default=None, description="User-level settings for silence/filler removal and command keywords")
    # Optional profile personalization fields
    first_name: Optional[str] = Field(default=None, max_length=80, description="User given name for personalization")
    last_name: Optional[str] = Field(default=None, max_length=120, description="User family name")
    timezone: Optional[str] = Field(default=None, description="IANA timezone string for scheduling display")

class User(UserBase, table=True):
    """The database model for a User."""
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    subscription_expires_at: Optional[datetime] = Field(default=None, description="When the paid subscription ends")
    # Nullable last_login; populated on successful auth events
    last_login: Optional[datetime] = Field(default=None, description="Timestamp of last successful login")

    # This creates the link back to the templates that belong to this user
    templates: List["PodcastTemplate"] = Relationship(back_populates="user")

class UserCreate(UserBase):
    """Schema for creating a new user (registration)."""
    password: str = Field(..., min_length=8)

class UserPublic(UserBase):
    """Schema for returning user data to the client (omits password)."""
    id: UUID
    created_at: datetime
    last_login: Optional[datetime] = None
    # Admin flags exposed for frontend gating
    is_admin: bool = Field(default=False, description="Whether this user has admin privileges")
    role: Optional[str] = Field(default=None, description="Normalized role label, e.g., 'admin'")
