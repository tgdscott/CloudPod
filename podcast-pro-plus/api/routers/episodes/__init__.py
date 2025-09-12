from fastapi import APIRouter

# Aggregator router: parent provides '/episodes' prefix
router = APIRouter(prefix="/episodes", tags=["episodes"])

# Import and include subrouters (moved into this package)
from .read import router as read_router
from .write import router as write_router
from .assemble import router as assemble_router
from .publish import router as publish_router
from .jobs import router as jobs_router

router.include_router(read_router)
router.include_router(write_router)
router.include_router(assemble_router)
router.include_router(publish_router)
router.include_router(jobs_router)

__all__ = ["router"]
