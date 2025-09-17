from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy.event import listen
from sqlalchemy.engine import Engine
from sqlalchemy import text
import logging
import os

# Ensure models are imported so SQLModel metadata is populated
from ..models import user, podcast, settings as _app_settings  # noqa: F401
# Import usage ledger model so metadata contains it during create_all
from ..models import usage as _usage_models  # noqa: F401
from .paths import WS_ROOT
from pathlib import Path
from .config import settings

log = logging.getLogger(__name__)

# --- Cloud SQL Connector ---
IS_CLOUD_SQL = bool(settings.INSTANCE_CONNECTION_NAME)

if IS_CLOUD_SQL:
    from google.cloud.sql.connector import Connector, IPTypes
    import pg8000

    connector = Connector()

    def getconn() -> pg8000.dbapi.Connection:
        conn: pg8000.dbapi.Connection = connector.connect(
            settings.INSTANCE_CONNECTION_NAME,
            "pg8000",
            user=settings.DB_USER,
            password=settings.DB_PASS,
            db=settings.DB_NAME,
            ip_type=IPTypes.PRIVATE,
        )
        return conn

    engine = create_engine(
        "postgresql+pg8000://",
        creator=getconn,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DB_POOL_SIZE", 5)),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", 0)),
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE", 180)),
        future=True,
    )

else:
    # --- SQLite Fallback ---
    _DB_PATH: Path = Path(os.getenv("SQLITE_PATH", "/tmp/ppp.db")).resolve()
    _DEFAULT_SQLITE_URL = f"sqlite:///{_DB_PATH.as_posix()}"
    engine = create_engine(
        _DEFAULT_SQLITE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )

    def _enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    listen(engine, "connect", _enable_foreign_keys)


def _is_sqlite_engine() -> bool:
    return not IS_CLOUD_SQL


def _ensure_episode_new_columns():
    """Add newly introduced Episode columns if they don't already exist.

    Safe to run on every startup (SQLite additive migrations).
    """
    if not _is_sqlite_engine():
        return
    wanted = {
    "season_number": "INTEGER",
    "episode_number": "INTEGER",
        "remote_cover_url": "TEXT",
        "spreaker_publish_error": "TEXT",
        "spreaker_publish_error_detail": "TEXT",
        "needs_republish": "INTEGER DEFAULT 0",
        "publish_at_local": "TEXT",
        "tags_json": "TEXT DEFAULT '[]'",
        "is_explicit": "INTEGER DEFAULT 0",
        "image_crop": "TEXT",
    }
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(episode)"))
            existing = {row[1] for row in res}
            for col, ddl in wanted.items():
                if col not in existing:
                    try:
                        log.info(f"[migrate] Adding missing column episode.{col}")
                        conn.execute(text(f"ALTER TABLE episode ADD COLUMN {col} {ddl}"))
                    except Exception as e:  # pragma: no cover
                        log.error(f"[migrate] Failed adding column {col}: {e}")
            conn.commit()
    except Exception as e:  # pragma: no cover
        log.error(f"[migrate] Episode column introspection failed: {e}")


def _ensure_podcast_new_columns():
    """Add newly introduced Podcast columns if they don't exist.

    Currently handles: remote_cover_url (TEXT)
    Safe & idempotent for SQLite.
    """
    if not _is_sqlite_engine():
        return
    wanted = {
        "remote_cover_url": "TEXT",
    }
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(podcast)"))
            existing = {row[1] for row in res}
            for col, ddl in wanted.items():
                if col not in existing:
                    try:
                        log.info(f"[migrate] Adding missing column podcast.{col}")
                        conn.execute(text(f"ALTER TABLE podcast ADD COLUMN {col} {ddl}"))
                    except Exception as e:  # pragma: no cover
                        log.error(f"[migrate] Failed adding podcast column {col}: {e}")
            conn.commit()
    except Exception as e:  # pragma: no cover
        log.error(f"[migrate] Podcast column introspection failed: {e}")


def _ensure_template_new_columns():
    """Add newly introduced PodcastTemplate columns if they don't exist.

    Currently handles: ai_settings_json (TEXT)
    Safe & idempotent for SQLite.
    """
    if not _is_sqlite_engine():
        return
    wanted = {
        "ai_settings_json": "TEXT DEFAULT '{}'",
        "is_active": "INTEGER DEFAULT 1",
        "default_elevenlabs_voice_id": "TEXT",
    }
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(podcasttemplate)"))
            existing = {row[1] for row in res}
            for col, ddl in wanted.items():
                if col not in existing:
                    try:
                        log.info(f"[migrate] Adding missing column podcasttemplate.{col}")
                        conn.execute(text(f"ALTER TABLE podcasttemplate ADD COLUMN {col} {ddl}"))
                    except Exception as e:  # pragma: no cover
                        log.error(f"[migrate] Failed adding podcasttemplate column {col}: {e}")
            conn.commit()
    except Exception as e:  # pragma: no cover
        log.error(f"[migrate] PodcastTemplate column introspection failed: {e}")


def create_db_and_tables():
    # Create any new tables first.
    SQLModel.metadata.create_all(engine)
    # Then perform lightweight additive migrations.
    _ensure_episode_new_columns()
    _ensure_podcast_new_columns()
    _ensure_template__new_columns()
    # Opportunistically create AppSetting table if missing (older deployments)
    if _is_sqlite_engine():
        try:
            with engine.connect() as conn:
                res = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='appsetting'"))
                if not res.fetchone():
                    conn.execute(text(
                        """
CREATE TABLE appsetting (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
"""
                    ))
                    conn.commit()
        except Exception:
            # best-effort; table may already exist
            pass


def get_session():
    # Provide a database session to your API endpoints.
    with Session(engine) as session:
        yield session