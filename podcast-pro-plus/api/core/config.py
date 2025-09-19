from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # --- Core Infrastructure ---
    DB_USER: str
    DB_PASS: str
    DB_NAME: str
    INSTANCE_CONNECTION_NAME: str
    SECRET_KEY: str # Used for signing JWTs
    SESSION_SECRET_KEY: str # Used for signing session cookies

    # --- Service API Keys ---
    GEMINI_API_KEY: str
    ELEVENLABS_API_KEY: str
    ASSEMBLYAI_API_KEY: str

    # --- Spreaker API ---
    SPREAKER_API_TOKEN: str
    SPREAKER_CLIENT_ID: str
    SPREAKER_CLIENT_SECRET: str
    SPREAKER_REDIRECT_URI: Optional[str] = None

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str

    # --- Stripe Billing ---
    STRIPE_SECRET_KEY: str
    STRIPE_WEBHOOK_SECRET: str

    # --- Application Behavior ---
    ADMIN_EMAIL: str
    MEDIA_ROOT: str = "/tmp"
    OAUTH_BACKEND_BASE: Optional[str] = None
    CORS_ALLOWED_ORIGINS: str

    # --- Legal ---
    TERMS_VERSION: str = "2025-09-19"
    TERMS_URL: str = "https://app.getpodcastplus.com/terms"

    # --- JWT Settings ---
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    @property
    def cors_allowed_origin_list(self) -> list[str]:
        raw = self.CORS_ALLOWED_ORIGINS or ""
        normalized = raw.replace(';', ',')
        return [origin.strip() for origin in normalized.split(',') if origin.strip()]

    @model_validator(mode="after")
    def _apply_spreaker_defaults(self):
        if not self.SPREAKER_REDIRECT_URI:
            base = (self.OAUTH_BACKEND_BASE or "https://api.getpodcastplus.com").rstrip("/")
            self.SPREAKER_REDIRECT_URI = f"{base}/api/spreaker/auth/callback"
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"

# Create a single, immutable instance of the settings
settings = Settings()

