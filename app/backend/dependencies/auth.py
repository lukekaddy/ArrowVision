import base64
import json
import logging
from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from schemas.auth import UserResponse, UserRole

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


def normalize_role(role: object) -> UserRole:
    return UserRole.admin if role == UserRole.admin.value else UserRole.archer


def _decode_unverified_jwt_payload(token: str) -> dict[str, Any]:
    try:
        payload_segment = token.split('.')[1]
        padding = '=' * (-len(payload_segment) % 4)
        decoded = base64.urlsafe_b64decode(payload_segment + padding)
        return json.loads(decoded)
    except Exception as exc:
        logger.warning("Unable to decode Supabase JWT payload: %s", type(exc).__name__)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase session token") from exc


async def get_bearer_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """Extract the Supabase bearer token sent by the frontend session."""
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    logger.debug("Supabase session required for request %s %s", request.method, request.url.path)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Supabase session required")


async def get_current_user(token: str = Depends(get_bearer_token)) -> UserResponse:
    """Return user identity from the Supabase session token.

    FastAPI does not issue or manage authentication. The frontend authenticates
    with Supabase and forwards the Supabase access token for business APIs that
    need user context.
    """
    payload = _decode_unverified_jwt_payload(token)
    metadata = payload.get("user_metadata") or {}
    app_metadata = payload.get("app_metadata") or {}
    role = normalize_role(metadata.get("role") or app_metadata.get("role"))

    user_id = str(payload.get("sub") or "")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase session token")

    return UserResponse(
        id=user_id,
        email=str(payload.get("email") or ""),
        role=role,
        first_name=str(metadata.get("first_name") or metadata.get("firstName") or ""),
        last_name=str(metadata.get("last_name") or metadata.get("lastName") or ""),
        phone=metadata.get("phone"),
    )


async def get_admin_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Ensure the Supabase-authenticated user has the admin role."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
