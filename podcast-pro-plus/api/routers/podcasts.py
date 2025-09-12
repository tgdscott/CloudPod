from fastapi import APIRouter, Depends, HTTPException, status, Form, File, UploadFile, Request, Body
from typing import Optional
from uuid import UUID, uuid4
from pathlib import Path
import shutil
import logging
from typing import List, Optional
from uuid import UUID, uuid4
from sqlmodel import Session, select, SQLModel
import shutil
from pathlib import Path
import logging

from ..core.database import get_session
from ..models.user import User
from ..models.podcast import Podcast, PodcastBase, PodcastType
from ..services.publisher import SpreakerClient
from ..services.image_utils import ensure_cover_image_constraints
from .auth import get_current_user

logging.basicConfig(level=logging.INFO)
from sqlmodel import Session, select

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/podcasts",
    tags=["Podcasts (Shows)"],
)

from api.core.paths import MEDIA_DIR
UPLOAD_DIRECTORY = MEDIA_DIR
UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)


class PodcastUpdate(SQLModel):
    # All fields optional for partial updates
    name: Optional[str] = None
    description: Optional[str] = None
    cover_path: Optional[str] = None
    podcast_type: Optional[PodcastType] = None
    language: Optional[str] = None
    copyright_line: Optional[str] = None
    owner_name: Optional[str] = None
    author_name: Optional[str] = None
    spreaker_show_id: Optional[str] = None
    contact_email: Optional[str] = None
    category_id: Optional[int] = None
    category_2_id: Optional[int] = None
    category_3_id: Optional[int] = None


@router.post("/", response_model=Podcast, status_code=status.HTTP_201_CREATED)
async def create_podcast(
    name: str = Form(...),
    description: str = Form(...),
    cover_image: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    log.info("--- Starting a new podcast creation process ---")
    log.info(f"Received request to create podcast with name: '{name}'")

    spreaker_show_id = None
    if current_user.spreaker_access_token:
        log.info("User has a Spreaker access token. Proceeding to create show on Spreaker.")
        client = SpreakerClient(api_token=current_user.spreaker_access_token)
        
        log.info(f"Calling SpreakerClient.create_show with title: '{name}'")
        success, result = client.create_show(title=name, description=description, language="en")
        
        if not success:
            log.error(f"Spreaker API call failed. Result: {result}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create show on Spreaker: {result}"
            )
        
        log.info(f"Spreaker API call successful. Result: {result}")
        spreaker_show_id = result.get("show_id")
        
        if not spreaker_show_id:
            log.error("Spreaker created the show but did not return a valid show_id.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Spreaker created the show but did not return a valid ID."
            )
        log.info(f"Successfully obtained Spreaker Show ID: {spreaker_show_id}")
    else:
        log.warning("User does not have a Spreaker access token. Skipping Spreaker show creation.")

    log.info("Creating podcast in local database.")
    db_podcast = Podcast(
        name=name,
        description=description,
        spreaker_show_id=spreaker_show_id,
        user_id=current_user.id
    )

    # If we created a Spreaker show, attempt to fetch its RSS URL immediately.
    if spreaker_show_id and current_user.spreaker_access_token:
        try:
            ok_show, resp_show = client.get_show(spreaker_show_id)
            if ok_show:
                show_obj = resp_show.get("show") or resp_show
                rss_candidate = (
                    show_obj.get("rss_url")
                    or show_obj.get("feed_url")
                    or show_obj.get("xml_url")
                )
                if rss_candidate:
                    db_podcast.rss_url = db_podcast.rss_url or rss_candidate
                    if not getattr(db_podcast, 'rss_url_locked', None):
                        db_podcast.rss_url_locked = rss_candidate
        except Exception as e:
            log.warning(f"Failed to fetch show RSS after creation: {e}")

    if cover_image and cover_image.filename:
        log.info(f"Cover image provided: '{cover_image.filename}'. Processing file.")
        # Validate content type and extension
        ct = (getattr(cover_image, 'content_type', '') or '').lower()
        if not ct.startswith('image/'):
            raise HTTPException(status_code=400, detail=f"Invalid cover content type '{ct or 'unknown'}'. Expected image.")
        ext = Path(cover_image.filename).suffix.lower()
        if ext not in {'.png', '.jpg', '.jpeg'}:
            raise HTTPException(status_code=400, detail="Unsupported cover image extension. Allowed: .png, .jpg, .jpeg")

        # Sanitize original name
        import re
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(cover_image.filename).name).strip("._") or "cover"
        file_extension = Path(safe_name).suffix
        unique_filename = f"{current_user.id}_{uuid4()}{file_extension}"
        save_path = UPLOAD_DIRECTORY / unique_filename

        # Stream copy with 10MB cap
        MB = 1024 * 1024
        max_bytes = 10 * MB
        total = 0
        try:
            with save_path.open("wb") as buffer:
                while True:
                    chunk = cover_image.file.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        try:
                            save_path.unlink(missing_ok=True)  # type: ignore[arg-type]
                        except Exception:
                            pass
                        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Cover image exceeds 10 MB limit.")
                    buffer.write(chunk)
            # Store only basename for consistency (URL construction handled elsewhere)
            db_podcast.cover_path = unique_filename  # legacy field; prefer remote_cover_url after upload
            log.info(f"Successfully saved cover image to: {save_path}")

            if spreaker_show_id:
                log.info(f"Uploading cover art to Spreaker for show ID: {spreaker_show_id}")
                ok_img, resp_img = client.update_show_image(show_id=spreaker_show_id, image_file_path=str(save_path))
                if ok_img and isinstance(resp_img, dict):
                    show_obj = resp_img.get('show') or resp_img
                    # Try to capture remote cover URL if returned
                    for k in ('image_url','cover_url','cover_art_url','image'):  # heuristic keys
                        if isinstance(show_obj, dict) and show_obj.get(k):
                            db_podcast.remote_cover_url = show_obj.get(k)
                            break
                elif not ok_img:
                    log.warning(f"Spreaker cover upload failed: {resp_img}")

        except HTTPException:
            raise
        except Exception as e:
            log.error(f"Failed to save or upload cover image: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save or upload cover image: {e}")
    else:
        log.info("No cover image was provided.")

    session.add(db_podcast)
    session.commit()
    session.refresh(db_podcast)
    log.info(f"Successfully saved podcast to local database with ID: {db_podcast.id}")
    log.info("--- Podcast creation process finished ---")
    return db_podcast


@router.get("/", response_model=List[Podcast])
async def get_user_podcasts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Podcast).where(Podcast.user_id == current_user.id)
    pods = session.exec(statement).all()
    # Ensure remote_cover_url is preferred when present (response_model will include fields automatically)
    # Nothing to mutate except legacy cover_path retention for now.
    return pods


log = logging.getLogger(__name__)

@router.put("/{podcast_id}", response_model=Podcast)
async def update_podcast(
    podcast_id: UUID,
    request: Request,
    podcast_update: PodcastUpdate = Body(default=None),
    cover_image: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    allow_spreaker_id_change: bool = False,
):
    """Update podcast metadata. Accepts JSON body for fields OR multipart with cover_image.
    If cover_image provided, saves new file and updates Spreaker artwork when show id + token present.
    """
    statement = select(Podcast).where(Podcast.id == podcast_id, Podcast.user_id == current_user.id)
    podcast_to_update = session.exec(statement).first()

    if not podcast_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found or you don't have permission to edit it.")

    original_spreaker_id = podcast_to_update.spreaker_show_id
    if podcast_update:
        pd = podcast_update.model_dump(exclude_unset=True)
        log.debug(f"[podcast.update] JSON payload keys={list(pd.keys())}")
        for key, value in pd.items():
            if key == 'rss_url_locked':
                continue
            if key == 'spreaker_show_id' and value and value != original_spreaker_id:
                if not allow_spreaker_id_change:
                    raise HTTPException(
                        status_code=400,
                        detail="Changing spreaker_show_id can break existing episode links. Resubmit with allow_spreaker_id_change=true to confirm."
                    )
            setattr(podcast_to_update, key, value)
    else:
        ct = request.headers.get("content-type", "") if request else ""
        candidate_keys = [
            "name","description","podcast_type","language","copyright_line",
            "owner_name","author_name","spreaker_show_id","cover_path","contact_email",
            "category_id","category_2_id","category_3_id"
        ]
        # Multipart branch
        if ct.startswith("multipart/form-data"):
            form = await request.form()
            for key in candidate_keys:
                if key in form and form.get(key) not in (None, ""):
                    val = form.get(key)
                    if key == 'spreaker_show_id' and val != original_spreaker_id and not allow_spreaker_id_change:
                        raise HTTPException(status_code=400, detail="Changing spreaker_show_id can break existing episode links. Resubmit with allow_spreaker_id_change=true to confirm.")
                    setattr(podcast_to_update, key, val)
            log.debug(f"[podcast.update] multipart keys applied: {[k for k in candidate_keys if k in form]}")
        # JSON fallback branch (when FastAPI didn't bind podcast_update due to mixed params)
        elif ct.startswith("application/json"):
            try:
                raw_json = await request.json()
                if isinstance(raw_json, dict):
                    applied = []
                    for key in candidate_keys:
                        if key in raw_json and raw_json[key] not in (None, ""):
                            val = raw_json[key]
                            if key == 'spreaker_show_id' and val != original_spreaker_id and not allow_spreaker_id_change:
                                raise HTTPException(status_code=400, detail="Changing spreaker_show_id can break existing episode links. Resubmit with allow_spreaker_id_change=true to confirm.")
                            setattr(podcast_to_update, key, val)
                            applied.append(key)
                    log.debug(f"[podcast.update] JSON fallback applied keys: {applied}")
            except Exception as je:
                log.warning(f"[podcast.update] JSON fallback parse failed: {je}")

    new_cover_saved = None
    if cover_image and cover_image.filename:
        file_extension = Path(cover_image.filename).suffix
        unique_filename = f"{current_user.id}_{uuid4()}{file_extension}"
        save_path = UPLOAD_DIRECTORY / unique_filename
        try:
            with save_path.open("wb") as buffer:
                shutil.copyfileobj(cover_image.file, buffer)
            # Ensure constraints (resize/compress) and possibly swap path
            processed_path = ensure_cover_image_constraints(str(save_path))
            if processed_path != str(save_path):
                processed_path_rel = Path(processed_path).name
                podcast_to_update.cover_path = processed_path_rel
            else:
                podcast_to_update.cover_path = unique_filename
            new_cover_saved = save_path
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save new cover image: {e}")

    session.add(podcast_to_update)
    session.commit()
    session.refresh(podcast_to_update)
    log.debug(f"[podcast.update] After local commit id={podcast_to_update.id} name={podcast_to_update.name} lang={podcast_to_update.language} author={podcast_to_update.author_name} owner={podcast_to_update.owner_name}")

    if podcast_to_update.spreaker_show_id and current_user.spreaker_access_token:
        try:
            client = SpreakerClient(api_token=current_user.spreaker_access_token)
            # Cover update
            if new_cover_saved:
                ok_img, resp_img = client.update_show_image(show_id=podcast_to_update.spreaker_show_id, image_file_path=str(new_cover_saved))
                if not ok_img:
                    log.warning(f"Spreaker cover update failed: {resp_img}")
                else:
                    show_obj = resp_img.get('show') if isinstance(resp_img, dict) else None
                    if isinstance(show_obj, dict):
                        for k in ('image_url','cover_url','cover_art_url','image'):
                            if show_obj.get(k):
                                podcast_to_update.remote_cover_url = show_obj.get(k)
                                # After capturing remote URL, we can keep cover_path for legacy until migration
                                break
            # Metadata update
            # Only attempt metadata update if we still have a valid (numeric) show id
            ok_meta = True
            resp_meta = None
            if podcast_to_update.spreaker_show_id and str(podcast_to_update.spreaker_show_id).isdigit():
                log.debug(
                    f"[podcast.update] Updating Spreaker metadata show_id={podcast_to_update.spreaker_show_id} payload="
                    f"title={podcast_to_update.name} desc_len={len(podcast_to_update.description or '')} lang={podcast_to_update.language}"
                )
                ok_meta, resp_meta = client.update_show_metadata(
                    show_id=podcast_to_update.spreaker_show_id,
                    title=podcast_to_update.name,
                    description=podcast_to_update.description,
                    language=podcast_to_update.language,
                    author_name=podcast_to_update.author_name,
                    owner_name=podcast_to_update.owner_name,
                    email=podcast_to_update.contact_email or current_user.email,
                    copyright_line=podcast_to_update.copyright_line,
                    show_type=(podcast_to_update.podcast_type.value if podcast_to_update.podcast_type else None),
                    category_id=podcast_to_update.category_id,
                    category_2_id=podcast_to_update.category_2_id,
                    category_3_id=podcast_to_update.category_3_id,
                )
                if not ok_meta:
                    log.warning(f"Spreaker metadata update failed: {resp_meta}")
            else:
                log.debug("[podcast.update] Skipped Spreaker metadata update (no numeric show id)")
            # If we don't yet have an RSS URL locked, fetch show details once.
            if not getattr(podcast_to_update, 'rss_url_locked', None):
                try:
                    ok_show, resp_show = client.get_show(podcast_to_update.spreaker_show_id)
                    if ok_show:
                        show_obj = resp_show.get("show") or resp_show
                        rss_candidate = (
                            show_obj.get("rss_url")
                            or show_obj.get("feed_url")
                            or show_obj.get("xml_url")
                        )
                        if rss_candidate:
                            podcast_to_update.rss_url_locked = rss_candidate
                            if not podcast_to_update.rss_url:
                                podcast_to_update.rss_url = rss_candidate
                            session.add(podcast_to_update)
                            session.commit()
                except Exception as ie:
                    log.warning(f"Failed fetching RSS URL for show update: {ie}")
        except Exception as e:
            log.warning(f"Spreaker metadata/cover update error: {e}")

    return podcast_to_update


@router.delete("/{podcast_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_podcast(
    podcast_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Podcast).where(Podcast.id == podcast_id, Podcast.user_id == current_user.id)
    podcast_to_delete = session.exec(statement).first()

    if not podcast_to_delete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Podcast not found.")

    session.delete(podcast_to_delete)
    session.commit()
    return None
