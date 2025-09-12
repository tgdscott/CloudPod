from __future__ import annotations

from typing import Optional, Any, Dict, List, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from api.models.podcast import Episode, Podcast, PodcastTemplate


def get_episode_by_id(session: Session, episode_id: UUID, user_id: Optional[UUID] = None) -> Optional[Episode]:
    q = session.query(Episode).filter_by(id=episode_id)
    if user_id is not None:
        q = q.filter_by(user_id=user_id)
    return q.first()


def get_podcast_by_id(session: Session, podcast_id: UUID) -> Optional[Podcast]:
    return session.query(Podcast).filter_by(id=podcast_id).first()


def get_template_by_id(session: Session, template_id: UUID) -> Optional[PodcastTemplate]:
    return session.query(PodcastTemplate).filter_by(id=template_id).first()


def get_first_podcast_for_user(session: Session, user_id: Any) -> Optional[Podcast]:
    return session.query(Podcast).filter_by(user_id=user_id).first()


def create_episode(session: Session, data: Dict[str, Any]) -> Episode:
    ep = Episode(**data)
    session.add(ep)
    session.commit()
    session.refresh(ep)
    return ep


def update_episode(session: Session, ep: Episode, fields: Dict[str, Any]) -> Episode:
    for k, v in fields.items():
        setattr(ep, k, v)
    session.add(ep)
    session.commit()
    session.refresh(ep)
    return ep


def delete_episode(session: Session, ep: Episode) -> None:
    session.delete(ep)
    session.commit()


def episode_exists_with_number(session: Session, podcast_id, season_number: int, episode_number: int, exclude_id: Optional[UUID] = None) -> bool:
    cand = (
        session.query(Episode)
        .filter_by(podcast_id=podcast_id, season_number=season_number, episode_number=episode_number)
        .first()
    )
    if not cand:
        return False
    if exclude_id and getattr(cand, 'id', None) == exclude_id:
        return False
    return True
