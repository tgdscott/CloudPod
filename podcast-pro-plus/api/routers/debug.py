from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session
from datetime import datetime
import os, importlib, inspect

from api.core.database import get_session
from api.models.podcast import Podcast, Episode

router = APIRouter(prefix="/debug", tags=["Debug"], include_in_schema=False)

STARTED_AT = datetime.utcnow().isoformat() + "Z"

@router.get("/info")
def debug_info(session: Session = Depends(get_session)):
    # Check columns existence via PRAGMA
    cols = {}
    for tbl in ("podcast", "episode", "user"):
        try:
            r = session.exec(text(f"PRAGMA table_info({tbl})"))
            cols[tbl] = [row[1] for row in r]
        except Exception as e:
            cols[tbl] = [f"<err {e}>"]
    # Basic counts
    counts = {}
    for model, name in ((Podcast, "podcast"), (Episode, "episode")):
        try:
            counts[name] = session.query(model).count()
        except Exception:
            counts[name] = None
    # Introspect a few loaded modules
    loaded = {}
    for mod_name in ("api.routers.episodes", "api.routers.podcasts", "api.models.podcast"):
        try:
            mod = importlib.import_module(mod_name)
            loaded[mod_name] = inspect.getsourcefile(mod)
        except Exception as e:
            loaded[mod_name] = f"<err {e}>"
    return {
        "started_at": STARTED_AT,
        "cwd": os.getcwd(),
        "columns": cols,
        "counts": counts,
        "loaded_module_files": loaded,
        "env_pythonpath": os.environ.get("PYTHONPATH"),
    }

@router.get("/podcast-fields")
def podcast_fields(session: Session = Depends(get_session)):
    p = session.query(Podcast).first()
    if not p:
        return {"podcast": None}
    data = p.model_dump()
    # Include dynamic attributes possibly not in dump
    for attr in ("rss_url_locked", "contact_email", "spreaker_show_id"):
        data[attr] = getattr(p, attr, None)
    return {"podcast": data}
