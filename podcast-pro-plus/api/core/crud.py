from sqlmodel import Session, select, func
from typing import Optional, List, Dict, Any
from uuid import UUID
import json

from .security import get_password_hash
from ..models.user import User, UserCreate, UserPublic
from ..models.podcast import Podcast, PodcastTemplate, PodcastTemplateCreate, Episode, EpisodeStatus
from ..models.subscription import Subscription

# --- User CRUD ---
def get_user_by_email(session: Session, email: str) -> Optional[User]:
    statement = select(User).where(User.email == email)
    return session.exec(statement).first()

def get_user_by_id(session: Session, user_id: UUID) -> Optional[User]:
    statement = select(User).where(User.id == user_id)
    return session.exec(statement).first()

def create_user(session: Session, user_create: UserCreate) -> User:
    hashed_password = get_password_hash(user_create.password)
    db_user = User.model_validate(user_create, update={"hashed_password": hashed_password})
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

def get_all_users(session: Session) -> List[User]:
    statement = select(User)
    return list(session.exec(statement).all())

# --- Stats CRUD ---
def get_user_stats(session: Session, user_id: UUID) -> Dict[str, Any]:
    """Aggregate lightweight user stats and recent activity signals."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import text as _sa_text, or_ as _or

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    # Total episodes
    try:
        total_episodes = session.query(Episode).filter_by(user_id=user_id).count()
    except Exception:
        total_episodes = 0

    # Episodes published in last 30 days (status=published and publish_at within window)
    try:
        q = (
            session.query(Episode)
            .filter_by(user_id=user_id, status=EpisodeStatus.published)
        )
        # Fetch a reasonable window to count in Python to avoid type issues
        rows = q.all()
        episodes_last_30d = 0
        for e in rows:
            dt = getattr(e, 'publish_at', None)
            if dt and dt >= thirty_days_ago:
                episodes_last_30d += 1
    except Exception:
        episodes_last_30d = 0

    # Upcoming scheduled (publish_at in future AND status not published)
    try:
        rows = session.query(Episode).filter_by(user_id=user_id).all()
        upcoming_scheduled = 0
        for e in rows:
            dt = getattr(e, 'publish_at', None)
            st = getattr(e, 'status', None)
            if dt and dt > now and st != EpisodeStatus.published:
                upcoming_scheduled += 1
    except Exception:
        upcoming_scheduled = 0

    # Last published at (latest publish_at where status=published)
    last_published_at = None
    try:
        ep = (
            session.query(Episode)
            .filter_by(user_id=user_id, status=EpisodeStatus.published)
            .order_by(_sa_text("publish_at DESC"))
            .limit(1)
            .first()
        )
        if ep and getattr(ep, 'publish_at', None):
            pub_dt = ep.publish_at
            if pub_dt.tzinfo is None or pub_dt.tzinfo.utcoffset(pub_dt) is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
            last_published_at = pub_dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    except Exception:
        last_published_at = None

    # Determine last assembly status: look at most recent episode by processed_at
    try:
        recent_episode = (
            session.query(Episode)
            .filter_by(user_id=user_id)
            .order_by(_sa_text("processed_at DESC"))
            .limit(1)
            .first()
        )
    except Exception:
        recent_episode = None
    if recent_episode:
        if recent_episode.status == EpisodeStatus.error:
            last_assembly_status = 'error'
        elif recent_episode.status in (EpisodeStatus.processed, EpisodeStatus.published):
            last_assembly_status = 'success'
        elif recent_episode.status in (EpisodeStatus.pending, EpisodeStatus.processing):
            last_assembly_status = 'pending'
        else:
            last_assembly_status = None
    else:
        last_assembly_status = None

    out = {
        "total_episodes": total_episodes,
        "episodes_last_30d": episodes_last_30d,
        "upcoming_scheduled": upcoming_scheduled,
        "last_published_at": last_published_at,
        "last_assembly_status": last_assembly_status,
        # Placeholder metrics (static for now)
        "total_downloads": 1567,
        "monthly_listeners": 342,
        "avg_rating": 4.8,
    }

    # Attempt lightweight Spreaker show + recent episode plays enrichment (best-effort)
    try:
        from ..models.podcast import Podcast
        user = session.exec(select(User).where(User.id == user_id)).first()
        token = getattr(user, 'spreaker_access_token', None)
        if token:
            from ..services.publisher import SpreakerClient
            client = SpreakerClient(token)

            # Source of truth: sum plays across all user shows for last 30 days
            try:
                user_id_str = client.get_user_id()
                if user_id_str:
                    from datetime import datetime, timedelta, timezone
                    now = datetime.now(timezone.utc)
                    since = now - timedelta(days=30)
                    params = {"from": since.strftime("%Y-%m-%d"), "to": now.strftime("%Y-%m-%d")}
                    ok_totals, totals_resp = client.get_user_shows_plays_totals(user_id_str, params=params)
                    if ok_totals and isinstance(totals_resp, dict):
                        items = totals_resp.get("items") or totals_resp.get("shows") or totals_resp.get("totals") or []
                        # Normalize mapping to list of dicts with plays_total
                        if isinstance(items, dict):
                            items = [
                                {"show_id": k, **({"plays_total": v} if isinstance(v, (int, float)) else (v or {}))}
                                for k, v in items.items()
                            ]
                        sum_30d = 0
                        has_any = False
                        for it in items:
                            if not isinstance(it, dict):
                                continue
                            v = it.get("plays_total") or it.get("plays") or it.get("count") or it.get("play_count")
                            try:
                                v = int(v) if v is not None else None
                            except Exception:
                                v = None
                            if isinstance(v, int):
                                sum_30d += v
                                has_any = True
                        if has_any:
                            out["plays_last_30d"] = sum_30d
            except Exception:
                # Ignore and fall back below
                pass

            # If we still don't have a 30d total, sum per-episode totals across all user shows (windowed)
            try:
                if 'plays_last_30d' not in out:
                    shows = (
                        session.query(Podcast)
                        .filter_by(user_id=user_id)
                        .filter(getattr(Podcast, 'spreaker_show_id') != None)  # noqa: E711
                        .all()
                    )
                    from datetime import datetime, timedelta, timezone
                    now = datetime.now(timezone.utc)
                    since = now - timedelta(days=30)
                    params = {"from": since.strftime("%Y-%m-%d"), "to": now.strftime("%Y-%m-%d")}
                    total_sum = 0
                    has_any = False
                    for s in shows or []:
                        sid = getattr(s, 'spreaker_show_id', None)
                        if not sid:
                            continue
                        ok_ep, data_ep = client.get_show_episodes_plays_totals(str(sid), params=params)
                        if not ok_ep or not isinstance(data_ep, dict):
                            continue
                        arr = data_ep.get("items") or data_ep.get("episodes") or []
                        for it in arr or []:
                            v = None
                            if isinstance(it, dict):
                                v = it.get("plays_total") or it.get("plays") or it.get("count") or it.get("play_count")
                            try:
                                v = int(v) if v is not None else None
                            except Exception:
                                v = None
                            if isinstance(v, int):
                                total_sum += v
                                has_any = True
                    if has_any:
                        out['plays_last_30d'] = total_sum
            except Exception:
                pass

            # Secondary: per-show statistics for a representative show (for lifetime total + fallback)
            try:
                show = (
                    session.query(Podcast)
                    .filter_by(user_id=user_id)
                    .filter(getattr(Podcast, 'spreaker_show_id') != None)  # noqa: E711
                    .limit(1)
                    .first()
                )
            except Exception:
                show = None
            if show and show.spreaker_show_id and str(show.spreaker_show_id).isdigit():
                ok_show, show_data = client._get(f"/shows/{show.spreaker_show_id}/statistics")
                if ok_show and isinstance(show_data, dict):
                    stats_obj = show_data.get('statistics') or show_data
                    if isinstance(stats_obj, dict):
                        plays_count = stats_obj.get('plays_count')
                        if plays_count is not None:
                            out['show_total_plays'] = plays_count
                        # If we still don't have a 30d value, try any provider-specific field
                        if 'plays_last_30d' not in out:
                            for k in (
                                'plays_last_30_days', 'plays_30_days', 'plays_30d',
                                'last_30_days_plays', 'thirty_day_plays'
                            ):
                                v = stats_obj.get(k)
                                if isinstance(v, (int, float)):
                                    out['plays_last_30d'] = int(v)
                                    break
                # Last three published episodes with spreaker ids (was 2 for initial minimal dashboard)
                try:
                    eps = (
                        session.query(Episode)
                        .filter_by(user_id=user_id)
                        .filter(getattr(Episode, 'spreaker_episode_id') != None)  # noqa: E711
                        .order_by(_sa_text("processed_at DESC"))
                        .limit(3)
                        .all()
                    )
                except Exception:
                    eps = []
                recent_ep_stats = []
                for ep in eps:
                    ep_id = getattr(ep, 'spreaker_episode_id', None)
                    if not ep_id:
                        continue
                    ok_ep, ep_obj = client.get_episode(str(ep_id))
                    plays_total = None
                    if ok_ep and isinstance(ep_obj, dict):
                        ep_item = ep_obj.get('episode') or ep_obj
                        plays_total = ep_item.get('plays_count') if isinstance(ep_item, dict) else None
                    recent_ep_stats.append({
                        'episode_id': str(ep.id),
                        'title': ep.title,
                        'plays_total': plays_total
                    })
                if recent_ep_stats:
                    out['recent_episode_plays'] = recent_ep_stats
    except Exception:
        # Silent best-effort; omit enrichment if failures
        pass

    return out

# --- NEW: Podcast (Show) CRUD ---
def create_podcast(session: Session, podcast_in: Podcast, user_id: UUID) -> Podcast:
    db_podcast = Podcast.model_validate(podcast_in, update={"user_id": user_id})
    session.add(db_podcast)
    session.commit()
    session.refresh(db_podcast)
    return db_podcast

def get_podcasts_by_user(session: Session, user_id: UUID) -> List[Podcast]:
    statement = select(Podcast).where(Podcast.user_id == user_id)
    return list(session.exec(statement).all())

def get_podcast_by_id(session: Session, podcast_id: UUID) -> Optional[Podcast]:
    """Fetch a single Podcast by its id."""
    statement = select(Podcast).where(Podcast.id == podcast_id)
    return session.exec(statement).first()

# --- Template CRUD ---
def get_template_by_id(session: Session, template_id: UUID) -> Optional[PodcastTemplate]:
    statement = select(PodcastTemplate).where(PodcastTemplate.id == template_id)
    return session.exec(statement).first()

def get_templates_by_user(session: Session, user_id: UUID) -> List[PodcastTemplate]:
    statement = select(PodcastTemplate).where(PodcastTemplate.user_id == user_id)
    return list(session.exec(statement).all())

def get_template_by_name_for_user(session: Session, user_id: UUID, name: str) -> Optional[PodcastTemplate]:
    """Case-insensitive lookup of a template name for a specific user."""
    statement = select(PodcastTemplate).where(PodcastTemplate.user_id == user_id).where(func.lower(PodcastTemplate.name) == func.lower(name))
    return session.exec(statement).first()

def create_user_template(session: Session, template_in: PodcastTemplateCreate, user_id: UUID) -> PodcastTemplate:
    segments_json_str = json.dumps([s.model_dump(mode='json') for s in template_in.segments])
    music_rules_json_str = json.dumps([r.model_dump(mode='json') for r in template_in.background_music_rules])
    # Enforce unique template name per user (case-insensitive)
    existing = get_template_by_name_for_user(session, user_id=user_id, name=template_in.name)
    if existing:
        raise ValueError("Template name already exists for this user")
    # AI settings JSON (default auto_fill_ai=True if missing)
    try:
        ai_json = template_in.ai_settings.model_dump_json()
    except Exception:
        ai_json = '{"auto_fill_ai": true}'

    db_template = PodcastTemplate(
        podcast_id=getattr(template_in, 'podcast_id', None),
        name=template_in.name,
        user_id=user_id,
        segments_json=segments_json_str,
        background_music_rules_json=music_rules_json_str,
        timing_json=template_in.timing.model_dump_json(),
        ai_settings_json=ai_json,
    is_active=getattr(template_in, 'is_active', True),
    default_elevenlabs_voice_id=getattr(template_in, 'default_elevenlabs_voice_id', None)
    )
    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    return db_template

# --- Episode CRUD ---
def get_episode_by_id(session: Session, episode_id: UUID) -> Optional[Episode]:
    statement = select(Episode).where(Episode.id == episode_id)
    return session.exec(statement).first()

# --- Subscription CRUD ---
def get_subscription_by_stripe_id(session: Session, stripe_subscription_id: str) -> Optional[Subscription]:
    statement = select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    return session.exec(statement).first()

def get_active_subscription_for_user(session: Session, user_id: UUID) -> Optional[Subscription]:
    try:
        statement = (
            select(Subscription)
            .where(Subscription.user_id == user_id)
            .where(getattr(Subscription, 'status').in_(["active","trialing","past_due"]))
        )
        return session.exec(statement).first()
    except Exception:
        # Fallback without status filter
        return session.exec(select(Subscription).where(Subscription.user_id == user_id)).first()

def upsert_subscription(session: Session, user_id: UUID, stripe_subscription_id: str, **fields) -> Subscription:
    # Accept string UUIDs defensively
    from uuid import UUID as _UUID
    if isinstance(user_id, str):
        try:
            user_id = _UUID(user_id)
        except Exception:
            raise ValueError("Invalid user_id for subscription upsert")
    sub = get_subscription_by_stripe_id(session, stripe_subscription_id)
    if not sub:
        sub = Subscription(user_id=user_id, stripe_subscription_id=stripe_subscription_id, plan_key=fields.get('plan_key','unknown'), price_id=fields.get('price_id','unknown'))
    for k,v in fields.items():
        if hasattr(sub, k):
            setattr(sub, k, v)
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub