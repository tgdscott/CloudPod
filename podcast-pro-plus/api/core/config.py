from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # This tells Pydantic to load variables from a .env file
    # OPENAI_API_KEY removed (no longer used)
    GEMINI_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = "YOUR_API_KEY_HERE"
    ASSEMBLYAI_API_KEY: str = "YOUR_API_KEY_HERE"
    SPREAKER_API_TOKEN: str = "YOUR_SPREAKER_TOKEN_HERE"
    SPREAKER_CLIENT_ID: str = "YOUR_SPREAKER_CLIENT_ID"
    SPREAKER_CLIENT_SECRET: str = "YOUR_SPREAKER_CLIENT_SECRET"
    # Updated default to current ngrok callback; override via environment in production
    SPREAKER_REDIRECT_URI: str = "https://chimp-big-wildly.ngrok-free.app/api/spreaker/auth/callback"

    # --- Google OAuth Settings ---
    GOOGLE_CLIENT_ID: str = "YOUR_GOOGLE_CLIENT_ID"
    GOOGLE_CLIENT_SECRET: str = "YOUR_GOOGLE_CLIENT_SECRET"

    # --- JWT Authentication Settings ---
    SECRET_KEY: str = "YOUR_SECRET_KEY_HERE"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # --- NEW: Admin User Setting ---
    ADMIN_EMAIL: str = "admin@example.com" # Default value if not in .env

    # --- THIS IS THE ONLY ADDED LINE ---
    SESSION_SECRET_KEY: str = "a_very_secret_key_that_should_be_changed"

    class Config:
        env_file = ".env"
        extra = "ignore"

# Create an instance of the settings
settings = Settings()

# --- Non-breaking runtime helper to warn if secrets are not configured ---
def warn_if_secrets_missing() -> None:
    import os, logging
    danger_keys = [
        "ELEVENLABS_API_KEY", "ASSEMBLYAI_API_KEY", "SPREAKER_API_TOKEN",
        "SPREAKER_CLIENT_ID", "SPREAKER_CLIENT_SECRET",
        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
        "SECRET_KEY",
    ]
    missing = []
    for k in danger_keys:
        val = (getattr(settings, k, "") or "").strip()
        if not val or val.startswith("YOUR_"):
            missing.append(k)

    if missing:
        env = os.getenv("ENV") or os.getenv("ENVIRONMENT") or "dev"
        if env.lower() in {"prod", "production"}:
            raise RuntimeError(f"Missing required secrets in production: {', '.join(missing)}")
        else:
            logging.getLogger(__name__).warning("Missing/placeholder secrets (dev allowed): %s", ", ".join(missing))

