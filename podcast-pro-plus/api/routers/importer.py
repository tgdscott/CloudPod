import httpx
import feedparser
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from ..core.database import get_session
from ..models.user import User
from ..models.podcast import Podcast, Episode, EpisodeStatus
from .auth import get_current_user

import logging

router = APIRouter(
    prefix="/import",
    tags=["Importer"],
)

class RssPayload(BaseModel):
    rss_url: str

@router.post("/rss", status_code=201)
async def import_from_rss(
    payload: RssPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    logger = logging.getLogger("api.importer")
    logger.info(f"Starting RSS import for user {current_user.id} with URL: {payload.rss_url}")
    try:
        existing_podcast = session.exec(select(Podcast).where(Podcast.rss_url == payload.rss_url, Podcast.user_id == current_user.id)).first()
        if existing_podcast:
            logger.warning(f"Podcast with RSS URL {payload.rss_url} already exists for user {current_user.id}")
            raise HTTPException(status_code=409, detail=f"Podcast '{existing_podcast.name}' has already been imported.")

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(payload.rss_url, timeout=30.0, follow_redirects=True)
                response.raise_for_status()
                logger.info(f"Successfully fetched RSS feed from {payload.rss_url}")
            except httpx.RequestError as e:
                logger.error(f"Failed to fetch RSS feed from {payload.rss_url}: {e}")
                raise HTTPException(status_code=400, detail=f"Failed to fetch RSS feed: {e}")
        
        feed = feedparser.parse(response.content)

        if not feed.feed or not feed.entries:
            logger.error(f"RSS feed from {payload.rss_url} is invalid or empty.")
            raise HTTPException(status_code=400, detail="Invalid or empty RSS feed.")

        feed_info = feed.feed
        logger.info(f"Parsing feed: {feed_info.get('title')}")
        
        new_podcast = Podcast(
            name=feed_info.get("title", "Untitled Podcast"),
            description=feed_info.get("summary", feed_info.get("subtitle")),
            rss_url=payload.rss_url,
            user_id=current_user.id,
            cover_path=feed_info.get("image", {}).get("href") # We save the original URL
        )
        session.add(new_podcast)
        session.commit()
        session.refresh(new_podcast)
        logger.info(f"Created new podcast with ID {new_podcast.id}")

        episodes_to_add = []
        for entry in feed.entries:
            audio_url = next((link.href for link in entry.get("links", []) if link.get("rel") == "enclosure"), None)
            if not audio_url: continue

            episode_cover_url = entry.get("image", {}).get("href", new_podcast.cover_path)
            publish_date = datetime(*entry.published_parsed[:6]) if hasattr(entry, 'published_parsed') and entry.published_parsed else None

            new_episode = Episode(
                user_id=current_user.id,
                podcast=new_podcast,
                title=entry.get("title", "Untitled Episode"),
                show_notes=entry.get("summary"),
                final_audio_path=audio_url, 
                status=EpisodeStatus.processed,
                publish_at=publish_date,
                cover_path=episode_cover_url
            )
            episodes_to_add.append(new_episode)
        
        session.add_all(episodes_to_add)
        session.commit()
        logger.info(f"Imported {len(episodes_to_add)} episodes for podcast {new_podcast.id}")
        
        return {
            "message": "Import successful!",
            "podcast_name": new_podcast.name,
            "episodes_imported": len(episodes_to_add)
        }
    except Exception as e:
        logger.exception(f"An unexpected error occurred during RSS import: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")