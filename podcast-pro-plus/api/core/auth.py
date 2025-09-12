# Shim module so imports like `from api.core.auth import get_current_user` work.
# We delegate to the real implementation in routers.auth.
from api.routers.auth import get_current_user
