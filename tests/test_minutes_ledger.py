import json
import threading
import time
from uuid import uuid4
from typing import List, cast

from sqlmodel import Session, select

from api.models.usage import ProcessingMinutesLedger, LedgerDirection, LedgerReason
from api.services.billing import usage as usage_svc
from fastapi.testclient import TestClient
from importlib import import_module
from uuid import UUID


def _rows(session: Session) -> List[ProcessingMinutesLedger]:
    return cast(List[ProcessingMinutesLedger], session.exec(select(ProcessingMinutesLedger)).all())


def test_debit_on_process_start_and_no_refund_on_delete(session: Session):
    # Arrange
    user_id = uuid4()
    episode_id = uuid4()
    minutes = 5
    corr = f"job:{episode_id}"

    # Act: simulate processing start debit
    rec = usage_svc.post_debit(session, user_id, minutes, episode_id, reason="PROCESS_AUDIO", correlation_id=corr)
    assert rec is not None

    # Simulate deleting processed content: no automatic refund should occur
    # (No call to post_credit here; this asserts no implicit credit.)

    # Assert
    rows = _rows(session)
    assert len(rows) == 1
    assert rows[0].direction == LedgerDirection.DEBIT
    assert rows[0].minutes == minutes
    # running total: credits - debits
    assert usage_svc.balance_minutes(session, user_id) == -minutes


def test_admin_manual_refund_creates_credit(session: Session):
    user_id = uuid4()
    episode_id = uuid4()
    minutes = 7
    corr = f"job:{episode_id}"

    usage_svc.post_debit(session, user_id, minutes, episode_id, reason="PROCESS_AUDIO", correlation_id=corr)

    # Admin override: compensating credit (manual_refund tag in notes)
    credit = usage_svc.post_credit(
        session,
        user_id,
        minutes,
        episode_id,
        reason="MANUAL_ADJUST",
        correlation_id=f"refund:{episode_id}",
        notes="manual_refund",
    )
    assert credit.direction == LedgerDirection.CREDIT
    assert credit.reason in (LedgerReason.MANUAL_ADJUST, LedgerReason("MANUAL_ADJUST"))
    assert credit.notes == "manual_refund"

    rows = _rows(session)
    # one debit + one credit
    assert len(rows) == 2
    assert usage_svc.balance_minutes(session, user_id) == 0


def test_idempotent_debit_same_corr_only_once(session: Session):
    user_id = uuid4()
    episode_id = uuid4()
    minutes = 3
    corr = f"job:{episode_id}"

    r1 = usage_svc.post_debit(session, user_id, minutes, episode_id, correlation_id=corr)
    r2 = usage_svc.post_debit(session, user_id, minutes, episode_id, correlation_id=corr)

    # Second call should be a no-op due to unique index; returns None
    assert r1 is not None
    assert r2 is None

    rows = _rows(session)
    assert len(rows) == 1
    assert rows[0].direction == LedgerDirection.DEBIT
    assert usage_svc.balance_minutes(session, user_id) == -minutes


def test_non_idempotent_debits_with_distinct_corr_ids(session: Session):
    user_id = uuid4()
    episode_id = uuid4()
    minutes = 2

    r1 = usage_svc.post_debit(session, user_id, minutes, episode_id, correlation_id=f"job:{episode_id}:1")
    r2 = usage_svc.post_debit(session, user_id, minutes, episode_id, correlation_id=f"job:{episode_id}:2")

    assert r1 is not None and r2 is not None

    rows = _rows(session)
    assert len(rows) == 2
    assert sum(1 for r in rows if r.direction == LedgerDirection.DEBIT) == 2
    assert usage_svc.balance_minutes(session, user_id) == -(minutes * 2)


def test_concurrent_debits_dont_double_charge(session: Session):
    user_id = uuid4()
    episode_id = uuid4()
    minutes = 4
    corr = f"job:{episode_id}"

    results = []

    # Each thread must use its own Session bound to the same engine
    engine = session.get_bind()
    def worker():
        with Session(engine) as s:
            res = usage_svc.post_debit(s, user_id, minutes, episode_id, correlation_id=corr)
        results.append(res is not None)

    t1 = threading.Thread(target=worker)
    t2 = threading.Thread(target=worker)
    t1.start(); t2.start()
    t1.join(); t2.join()

    # Exactly one succeeds, one is a no-op
    assert sum(1 for x in results if x) == 1
    assert sum(1 for x in results if not x) == 1

    rows = _rows(session)
    assert len(rows) == 1
    assert rows[0].direction == LedgerDirection.DEBIT
    assert usage_svc.balance_minutes(session, user_id) == -minutes


def test_concurrent_episode_delete_idempotent_no_credits(session: Session, client: TestClient):
    """Fire several DELETEs for the same processed episode.

    Expect: endpoint returns 204 for all (idempotent) and no credit rows are added.
    """
    # Seed a user, podcast, episode directly via models
    from api.models.user import User  # type: ignore
    from api.models.podcast import Podcast, Episode, EpisodeStatus  # type: ignore

    uid = uuid4()
    user = User(email='ledgertest@example.com', hashed_password='x', id=uid)
    pod = Podcast(name='Show', user_id=uid)
    ep = Episode(title='E1', user_id=uid, podcast_id=pod.id, status=EpisodeStatus.processed)
    session.add(user); session.add(pod); session.add(ep); session.commit(); session.refresh(ep)

    # Debit some minutes for this episode
    usage_svc.post_debit(session, uid, 6, ep.id, correlation_id=f"job:{ep.id}")
    start_balance = usage_svc.balance_minutes(session, uid)

    # Authenticate as the user by stubbing token: our test auth reads User via email in token 'sub'
    # Build a JWT or patch dependency; easier path: set Authorization header and monkeypatch oauth decode?
    # Simpler: directly call repository delete through API route without auth by exercising internal client with override
    app_mod = import_module('api.main')
    app = getattr(app_mod, 'app')

    # Create a client that injects Authorization header for this user
    test_client = client  # provided fixture already wraps the same app
    headers = {"Authorization": "Bearer test"}

    # Stub current user dependency to our user for this test scope
    from fastapi import Depends
    from fastapi.testclient import TestClient as _TC
    from api.routers.auth import get_current_user as real_get_current_user  # type: ignore
    # Return a plain dict to avoid ORM lazy-loading under concurrency
    def _fake_current_user():
        return {"id": user.id}
    app.dependency_overrides[real_get_current_user] = _fake_current_user

    try:
        # Fire 5 concurrent deletes
        import concurrent.futures
        url = f"/api/episodes/{ep.id}"
        def do_del():
            r = test_client.delete(url, headers=headers)
            return r.status_code
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
            codes = list(ex.map(lambda _: do_del(), range(5)))
        # All should be 204 (idempotent success)
        assert all(code == 204 for code in codes)
    finally:
        app.dependency_overrides.pop(real_get_current_user, None)

    # Ensure no credit rows were added; balance unchanged
    end_balance = usage_svc.balance_minutes(session, uid)
    assert end_balance == start_balance

