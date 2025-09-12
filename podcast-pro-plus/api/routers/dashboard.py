from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from api.core.database import get_session
from api.models.user import User
from api.models.podcast import Podcast, Episode
from api.services.publisher import SpreakerClient
from api.core.auth import get_current_user
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    token = getattr(current_user, "spreaker_access_token", None)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Spreaker not connected")
    client = SpreakerClient(token)
    # Find all shows for this user that have a linked spreaker_show_id
    shows = session.exec(select(Podcast).where(Podcast.user_id == current_user.id).where(getattr(Podcast, 'spreaker_show_id') != None)).all()  # noqa: E711
    episodes_last_30d = 0
    plays_last_30d = 0
    recent_episodes = []
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    params = {"from": since.strftime("%Y-%m-%d"), "to": now.strftime("%Y-%m-%d")}
    # For each show, fetch episode list and stats
    for show in shows:
        sid = getattr(show, 'spreaker_show_id', None)
        if not sid:
            continue
        # 1. Count published episodes in last 30d
        ok, ep_list = client._get_paginated(f"/shows/{sid}/episodes", params={"limit": 100, **params}, items_key="items")
        if ok and isinstance(ep_list, dict):
            for ep in ep_list.get("items", []):
                pub = ep.get("published_at") or ep.get("publish_at")
                if pub:
                    try:
                        pub_dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
                        if pub_dt >= since:
                            episodes_last_30d += 1
                    except Exception:
                        pass
        # 2. Get show-level plays in last 30d
        ok, stats = client._get(f"/shows/{sid}/statistics/plays", params=params)
        if ok and isinstance(stats, dict):
            plays = stats.get("plays_count") or stats.get("plays_total")
            try:
                if plays is not None:
                    plays = int(plays)
                    plays_last_30d += plays
            except Exception:
                pass
        # 3. Get per-episode play counts for recent episodes
        ok, ep_stats = client.get_show_episodes_plays_totals(str(sid), params=params)
        if ok and isinstance(ep_stats, dict):
            for ep in (ep_stats.get("items") or []):
                title = ep.get("title") or ep.get("name") or "Untitled"
                plays = ep.get("plays_total") or ep.get("plays") or ep.get("count") or ep.get("play_count")
                try:
                    if plays is not None:
                        plays = int(plays)
                except Exception:
                    plays = None
                recent_episodes.append({"title": title, "plays_total": plays})
    # Sort recent_episodes by plays desc, take top 4
    recent_episodes = sorted(recent_episodes, key=lambda x: (x["plays_total"] or 0), reverse=True)[:4]
    return {
        "episodes_last_30d": episodes_last_30d,
        "plays_last_30d": plays_last_30d,
        "recent_episodes": recent_episodes,
    }