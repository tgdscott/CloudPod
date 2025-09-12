from fastapi import APIRouter, Depends

router = APIRouter()

# Try the expected path; if it differs in your repo, update this import.
try:
    from api.core.auth import get_current_user  # type: ignore
except Exception:  # pragma: no cover
    def get_current_user():
        # This makes the route fail clearly if the import path is different.
        # Update the import above to match your project.
        raise RuntimeError("Wire get_current_user from api.core.auth")

@router.get("/api/auth/me")
def auth_me(user=Depends(get_current_user)):
    # Return whatever your get_current_user provides (Pydantic model or dict)
    return {"user": user}
