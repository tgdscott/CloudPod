from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from sqlmodel import Session

from ..core.config import settings
from ..models.user import User, UserPublic
from ..core.database import get_session
from ..core import crud
from .auth import get_current_user

router = APIRouter(
    prefix="/users",
    tags=["Users"],
)

class ElevenLabsAPIKeyUpdate(BaseModel):
    api_key: str

class SpreakerTokenUpdate(BaseModel):
    access_token: str

class AudioCleanupSettingsUpdate(BaseModel):
    settings: Dict[str, Any]

class AudioCleanupSettingsPublic(BaseModel):
    settings: Dict[str, Any]

@router.get("/me", response_model=UserPublic)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user.

    Mirrors the behavior of the auth router's /auth/users/me endpoint but under
    /users/me for consistency with other user-scoped routes (e.g., /users/me/stats).
    """
    # Enrich with admin flags (do not persist)
    data = current_user.model_dump()
    try:
        admin_email = getattr(settings, "ADMIN_EMAIL", None)
        is_admin = bool(
            current_user.email
            and admin_email
            and str(current_user.email).lower() == str(admin_email).lower()
        )
    except Exception:
        is_admin = False
    data.update({
        "is_admin": is_admin,
        "role": "admin" if is_admin else None,
    })
    return UserPublic(**data)

@router.get("/me/stats", response_model=Dict[str, Any])
async def read_user_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Gets key statistics for the currently logged-in user."""
    return crud.get_user_stats(session=session, user_id=current_user.id)

@router.put("/me/elevenlabs-key", response_model=UserPublic)
async def update_elevenlabs_api_key(
    key_update: ElevenLabsAPIKeyUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Updates the ElevenLabs API key for the current user."""
    current_user.elevenlabs_api_key = key_update.api_key
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

@router.put("/me/spreaker-token", response_model=UserPublic)
async def update_spreaker_access_token(
    token_update: SpreakerTokenUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Store/replace the user's Spreaker personal access token so we can provision shows & publish episodes."""
    if not token_update.access_token or len(token_update.access_token) < 10:
        raise HTTPException(status_code=400, detail="Invalid Spreaker token")
    current_user.spreaker_access_token = token_update.access_token.strip()
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

@router.put("/me/audio-cleanup-settings", response_model=UserPublic)
async def update_audio_cleanup_settings(
    payload: AudioCleanupSettingsUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Update per-user audio cleanup & command keyword settings.

        Expected structure example (keys are optional; omitted keys keep prior values or defaults on read):
    {
      "removeFillers": true,
      "fillerWords": ["um","uh"],
      "removePauses": true,
      "maxPauseSeconds": 1.5,
      "targetPauseSeconds": 0.5,
            "commands": {"flubber": {"action":"rollback_restart"}},
            "censorEnabled": true,
            "censorWords": ["fuck","shit","son of a"],
            "censorFuzzy": true,
            "censorMatchThreshold": 0.8,
            "censorBeepMs": 250,
            "censorBeepFreq": 1000,
            "censorBeepGainDb": 0.0,
            "censorBeepFile": "media_uploads/censor_beep.mp3"
        }
    """
    import json
    try:
        # Basic validation: ensure keys are JSON serializable
        json.dumps(payload.settings)
    except Exception:
        raise HTTPException(status_code=400, detail="Settings must be JSON serializable")

    # ---- Core Audio Cleanup fields validation and defaults
    from pydantic import BaseModel

    class _CleanupCore(BaseModel):
        removeFillers: bool = True
        removePauses: bool = True
        maxPauseSeconds: float = 1.5
        targetPauseSeconds: float = 0.5

    s_in = dict(payload.settings or {})
    # Build model from provided keys (fallbacks use defaults)
    model = _CleanupCore(
        removeFillers=bool(s_in.get('removeFillers', True)) if 'removeFillers' in s_in else True,
        removePauses=bool(s_in.get('removePauses', True)) if 'removePauses' in s_in else True,
        maxPauseSeconds=float(s_in.get('maxPauseSeconds', 1.5)) if 'maxPauseSeconds' in s_in else 1.5,
        targetPauseSeconds=float(s_in.get('targetPauseSeconds', 0.5)) if 'targetPauseSeconds' in s_in else 0.5,
    )
    # Constraints: max >= target > 0
    if not (model.targetPauseSeconds > 0 and model.maxPauseSeconds >= model.targetPauseSeconds):
        raise HTTPException(status_code=400, detail="Invalid pause settings: require maxPauseSeconds >= targetPauseSeconds > 0")

    # Ensure these keys exist in stored JSON (back-compat for older saves)
    s_in.update({
        'removeFillers': model.removeFillers,
        'removePauses': model.removePauses,
        'maxPauseSeconds': float(model.maxPauseSeconds),
        'targetPauseSeconds': float(model.targetPauseSeconds),
    })

    current_user.audio_cleanup_settings_json = json.dumps(s_in)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

@router.get("/me/audio-cleanup-settings", response_model=AudioCleanupSettingsPublic)
async def get_audio_cleanup_settings(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    import json
    raw = getattr(current_user, 'audio_cleanup_settings_json', None)
    # Provide sensible defaults for censor-beep so UI can render controls without prior saves
    defaults = {
        "censorEnabled": False,
        "censorWords": ["fuck", "shit"],
        "censorFuzzy": True,
        "censorMatchThreshold": 0.8,
        "censorBeepMs": 250,
        "censorBeepFreq": 1000,
        "censorBeepGainDb": 0.0,
        # Path is relative to project root; preferred location for uploads
        "censorBeepFile": None,
    # Audio Cleanup (MVP) defaults
    "removeFillers": True,
    "fillerWords": ["um","uh","er","ah"],
    "removePauses": True,
    "maxPauseSeconds": 1.5,
    "targetPauseSeconds": 0.5,
    # Command defaults (ensure Intern/Flubber always exist with sane shapes)
    "commands": {
        "flubber": {"action": "rollback_restart", "trigger_keyword": "flubber"},
        "intern": {
            "action": "ai_command",
            "trigger_keyword": "intern",
            "end_markers": ["stop", "stop intern"],
            "remove_end_marker": True,
            "keep_command_token_in_transcript": True,
        },
    },
    }
    if not raw:
        return { 'settings': defaults }
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = {}
    # Merge defaults for missing keys
    if isinstance(parsed, dict):
        merged = {**defaults, **parsed}
        try:
            cmds = merged.get("commands") or {}
            if not isinstance(cmds, dict):
                cmds = {}
            # Merge per-command defaults without overwriting user customizations
            cmd_defaults = defaults["commands"]
            out_cmds = {**cmd_defaults, **cmds}
            # For intern, ensure end_markers and flags have sensible defaults if missing
            intern_cfg = dict(out_cmds.get("intern") or {})
            if "end_markers" not in intern_cfg or not isinstance(intern_cfg.get("end_markers"), list):
                intern_cfg["end_markers"] = cmd_defaults["intern"]["end_markers"]
            if "remove_end_marker" not in intern_cfg:
                intern_cfg["remove_end_marker"] = cmd_defaults["intern"]["remove_end_marker"]
            if "keep_command_token_in_transcript" not in intern_cfg:
                intern_cfg["keep_command_token_in_transcript"] = cmd_defaults["intern"]["keep_command_token_in_transcript"]
            out_cmds["intern"] = intern_cfg
            merged["commands"] = out_cmds
        except Exception:
            pass
    else:
        merged = defaults
    return { 'settings': merged }

@router.get("/me/capabilities", response_model=Dict[str, Any])
async def get_user_capabilities(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Return lightweight capability flags for UI gating.

    - has_elevenlabs: user or env has ElevenLabs API key
    - has_google_tts: google text-to-speech import available (not a full runtime check)
    - has_any_sfx_triggers: user has at least one MediaItem with a trigger_keyword
    """
    from ..services.tts_google import texttospeech as _gtts  # type: ignore
    from ..core.config import settings as _settings
    from ..models.podcast import MediaItem
    from sqlmodel import select
    # TTS providers
    has_elevenlabs = bool(getattr(current_user, 'elevenlabs_api_key', None) or getattr(_settings, 'ELEVENLABS_API_KEY', None))
    has_google_tts = _gtts is not None
    # Any SFX triggers
    try:
        # SQLModel/SQLAlchemy where: use != None to test non-null string column
        stmt = select(MediaItem).where(
            MediaItem.user_id == current_user.id,
            MediaItem.trigger_keyword != None  # noqa: E711
        )
        items = session.exec(stmt).all()
        has_any_sfx_triggers = any(items)
    except Exception:
        has_any_sfx_triggers = False
    return {
        'has_elevenlabs': bool(has_elevenlabs),
        'has_google_tts': bool(has_google_tts),
        'has_any_sfx_triggers': bool(has_any_sfx_triggers),
    }