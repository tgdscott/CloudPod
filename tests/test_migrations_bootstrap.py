from importlib import import_module
from pathlib import Path
import sqlite3
from sqlmodel import create_engine, Session
import uuid


def test_migration_bootstrap_creates_core_tables(tmp_path):
    # Import database module via package path (conftest injects it to sys.path)
    db_mod = import_module('api.core.database')

    # Replace global engine with a temp one
    temp_db = tmp_path / 'bootstrap_test.db'
    engine = create_engine(f'sqlite:///{temp_db}', connect_args={"check_same_thread": False})
    db_mod.engine = engine  # monkeypatch engine used by create_db_and_tables

    # Run bootstrap/migrations
    db_mod.create_db_and_tables()

    # Inspect tables exist
    con = sqlite3.connect(temp_db)
    cur = con.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    names = {r[0] for r in cur.fetchall()}
    # Critical tables (subset)
    for required in {"user", "podcast", "episode", "podcasttemplate"}:
        assert required in names, f"Missing table {required} in {names}"

    # Seed an admin user (basic insertion path)
    User = import_module('api.models.user').User  # type: ignore[attr-defined]
    with Session(engine) as session:
        u = User(email='admin@example.com', hashed_password='fakehash', tier='admin')
        session.add(u)
        session.commit()
        # Verify persisted
        got = session.exec(db_mod.text("SELECT email FROM user WHERE email='admin@example.com'")) if hasattr(db_mod, 'text') else None
        # Fallback: SQLModel query
        assert session.get(User, u.id) is not None

    con.close()
    # Temp DB file cleanup implicit via tmp_path lifecycle
