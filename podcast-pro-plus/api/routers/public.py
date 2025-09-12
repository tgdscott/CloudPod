from fastapi import APIRouter, Query
from sqlalchemy.orm import Session
from api.core.database import get_session
from api.models.podcast import Episode
import os
from pathlib import Path
from api.core.paths import FINAL_DIR

router = APIRouter(prefix="/public", tags=["Public"])

@router.get("/episodes")
def public_episodes(limit: int = Query(10, ge=1, le=50)):
    """List recently published episodes (unauthenticated) for demo.
    Returns only fields safe for public consumption.
    """
    session: Session = next(get_session())
    try:
        eps = (
            session.query(Episode)
            .filter(Episode.status == "published")
            .order_by(Episode.processed_at.desc())
            .limit(limit)
            .all()
        )
        items = []
        missing = 0
        for e in eps:
            audio_url = None
            if e.final_audio_path:
                base = os.path.basename(e.final_audio_path)
                file_path = FINAL_DIR / base
                if file_path.exists():
                    audio_url = f"/static/final/{base}"
                else:
                    # Skip setting URL to avoid frontend 404 requests
                    missing += 1
            cover_url = None
            if e.cover_path:
                cp = str(e.cover_path)
                if cp.lower().startswith(("http://","https://")):
                    cover_url = cp
                else:
                    cover_url = f"/static/media/{os.path.basename(cp)}"
            items.append({
                "id": str(e.id),
                "title": e.title,
                "description": e.show_notes or "",
                "final_audio_url": audio_url,
                "cover_url": cover_url,
            })
        # Optionally include diagnostics count
        return {"items": items, "missing_audio": missing}
    finally:
        session.close()
