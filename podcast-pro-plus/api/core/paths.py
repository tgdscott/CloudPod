from __future__ import annotations

from pathlib import Path
import os


# Resolve important directories relative to the workspace root (PPPv0)
# This avoids scattering media under the backend package folder.
# Layout enforced:
# - Workspace root (WS_ROOT)
#   - media_uploads/
#   - final_episodes/
#   - cleaned_audio/
#   - edited_audio/
#   - transcripts/
#   - flubber_contexts/

APP_ROOT = Path(__file__).resolve().parents[2]          # .../podcast-pro-plus
# Allow override via env (for Cloud Run/GCS mounts). Falls back to workspace parent.
_ENV_MEDIA_ROOT = os.getenv("MEDIA_ROOT")
if _ENV_MEDIA_ROOT:
    try:
        WS_ROOT = Path(_ENV_MEDIA_ROOT).resolve()
    except Exception:
        WS_ROOT = APP_ROOT.parent
else:
    WS_ROOT = APP_ROOT.parent                                # .../PPPv0

MEDIA_DIR = WS_ROOT / "media_uploads"
FINAL_DIR = WS_ROOT / "final_episodes"
CLEANED_DIR = WS_ROOT / "cleaned_audio"
EDITED_DIR = WS_ROOT / "edited_audio"
TRANSCRIPTS_DIR = WS_ROOT / "transcripts"
FLUBBER_CTX_DIR = WS_ROOT / "flubber_contexts"
AI_SEGMENTS_DIR = WS_ROOT / "ai_segments"

# Ensure they exist at import time (idempotent)
for d in [MEDIA_DIR, FINAL_DIR, CLEANED_DIR, EDITED_DIR, TRANSCRIPTS_DIR, FLUBBER_CTX_DIR, AI_SEGMENTS_DIR]:
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

__all__ = [
    "APP_ROOT",
    "WS_ROOT",
    "MEDIA_DIR",
    "FINAL_DIR",
    "CLEANED_DIR",
    "EDITED_DIR",
    "TRANSCRIPTS_DIR",
    "FLUBBER_CTX_DIR",
    "AI_SEGMENTS_DIR",
]
