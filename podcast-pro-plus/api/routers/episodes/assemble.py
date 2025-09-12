import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.core.database import get_session
from api.core.auth import get_current_user
from api.models.user import User
from api.services.episodes import assembler as _svc_assembler

router = APIRouter(tags=["episodes"])  # parent episodes router provides '/episodes' prefix
log = logging.getLogger("ppp.episodes.assemble")

@router.post("/assemble", status_code=status.HTTP_202_ACCEPTED)
async def assemble_episode(
    payload: Dict[str, Any],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    log.debug("assemble_episode payload keys=%s", list(payload.keys()) if isinstance(payload, dict) else type(payload))

    template_id = payload.get("template_id")
    main_content_filename = payload.get("main_content_filename")
    output_filename = payload.get("output_filename")
    tts_values = payload.get("tts_values") or {}
    episode_details = payload.get("episode_details") or {}

    if not template_id or not main_content_filename or not output_filename:
        raise HTTPException(status_code=400, detail="template_id, main_content_filename, output_filename are required.")

    svc_result = _svc_assembler.assemble_or_queue(
        session=session,
        current_user=current_user,
        template_id=str(template_id),
        main_content_filename=str(main_content_filename),
        output_filename=str(output_filename),
        tts_values=tts_values,
        episode_details=episode_details,
        intents=payload.get('intents') or None,
    )

    if svc_result.get("mode") == "eager-inline":
        return {
            "job_id": "eager-inline",
            "status": "processed",
            "episode_id": svc_result.get("episode_id"),
            "message": "Episode assembled synchronously.",
            "result": svc_result.get("result"),
        }
    else:
        return {
            "job_id": svc_result.get("job_id"),
            "status": "queued",
            "episode_id": svc_result.get("episode_id"),
            "message": "Episode assembly has been queued."
        }
