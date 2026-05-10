"""Supabase JWT verification + a FastAPI dependency that mirrors the
authenticated user into our own ``users`` table.

Auth is *opt-in*: when ``SUPABASE_PROJECT_REF`` is unset the dependency degrades
to a permissive mode that accepts anonymous calls (so the legacy
handle-based flow still works for development without Supabase).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

import httpx
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from jwt import PyJWKClient

from .. import db

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Lazily resolve env vars so that import order doesn't matter — load_dotenv
# may run after this module is imported (e.g. in scripts).
_jwk_client_cache: Optional[PyJWKClient] = None
_resolved_settings: Optional[tuple[str, str, str]] = None  # (jwks_url, issuer, audience)


def _settings() -> Optional[tuple[str, str, str]]:
    """Read Supabase config from env on first call, then cache. Returns None
    when Supabase isn't configured (legacy mode)."""
    global _resolved_settings
    if _resolved_settings is not None:
        return _resolved_settings
    project_ref = os.environ.get("SUPABASE_PROJECT_REF")
    jwks_url = os.environ.get("SUPABASE_JWKS_URL") or (
        f"https://{project_ref}.supabase.co/auth/v1/.well-known/jwks.json"
        if project_ref else None
    )
    issuer = os.environ.get("SUPABASE_ISSUER") or (
        f"https://{project_ref}.supabase.co/auth/v1" if project_ref else None
    )
    audience = os.environ.get("SUPABASE_AUDIENCE", "authenticated")
    if not jwks_url or not issuer:
        return None
    _resolved_settings = (jwks_url, issuer, audience)
    return _resolved_settings


def _jwk_client() -> Optional[PyJWKClient]:
    global _jwk_client_cache
    if _jwk_client_cache is not None:
        return _jwk_client_cache
    s = _settings()
    if s is None:
        return None
    _jwk_client_cache = PyJWKClient(s[0])
    return _jwk_client_cache


def auth_enabled() -> bool:
    return _settings() is not None


def _decode_jwt(token: str) -> dict[str, Any]:
    client = _jwk_client()
    s = _settings()
    if client is None or s is None:
        raise HTTPException(status_code=500, detail="auth misconfigured")
    _, issuer, audience = s
    try:
        signing_key = client.get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            signing_key,
            algorithms=["RS256", "ES256"],
            audience=audience,
            issuer=issuer,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"invalid token: {exc}") from exc


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict[str, Any]]:
    """Returns the authenticated user record, or None when auth is disabled or
    the request is anonymous (for legacy compatibility). Routes that require a
    real user should call ``require_user`` instead.
    """
    if not auth_enabled():
        return None  # legacy mode — caller decides what to do
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    claims = _decode_jwt(token)
    sub = claims.get("sub")
    email = claims.get("email")
    if not sub:
        raise HTTPException(status_code=401, detail="token missing sub")
    row = await db.get_or_create_user_from_auth(sub, email)
    return row


async def require_user(
    user: Optional[dict[str, Any]] = Depends(get_current_user),
) -> dict[str, Any]:
    """Like ``get_current_user`` but 401s if there is no user. When auth is
    disabled (legacy mode), this still 401s — callers should branch on
    ``auth_enabled()`` if they want a degraded fallback."""
    if user is None:
        if not auth_enabled():
            raise HTTPException(
                status_code=401,
                detail="auth required (Supabase not configured on this server)",
            )
        raise HTTPException(status_code=401, detail="not authenticated")
    return user


async def soft_user(
    user: Optional[dict[str, Any]] = Depends(get_current_user),
) -> Optional[dict[str, Any]]:
    """When Supabase is configured, requires a valid JWT (401 otherwise).
    When Supabase is *not* configured (legacy dev), returns None and lets
    the request proceed unchanged. Use on routes that already accept a
    ``user_id`` in the request body — the legacy flow keeps working, and
    the JWT flow gets enforced once env vars are set."""
    if not auth_enabled():
        return None
    if user is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return user


# ---------------------------------------------------------------------------
# Read-only endpoint for the frontend to verify auth state.
# ---------------------------------------------------------------------------


def _has_bearer(authorization: Optional[str]) -> bool:
    if not authorization:
        return False
    return authorization.strip().lower().startswith("bearer ")


@router.get("/me")
async def me(
    user: Optional[dict[str, Any]] = Depends(get_current_user),
    authorization: Optional[str] = Header(default=None),
):
    if user is None:
        enabled = auth_enabled()
        if _has_bearer(authorization) and not enabled:
            return JSONResponse(
                status_code=503,
                content={
                    "auth_enabled": False,
                    "user": None,
                    "error": (
                        "This API is not configured to verify Supabase JWTs. "
                        "Set SUPABASE_PROJECT_REF on the backend (or SUPABASE_JWKS_URL "
                        "and SUPABASE_ISSUER) so /api/auth/me can mirror auth into "
                        "public.users."
                    ),
                },
            )
        return {"auth_enabled": enabled, "user": None}
    return {
        "auth_enabled": True,
        "user": {
            "id": str(user["id"]),
            "handle": user.get("handle"),
            "email": user.get("email"),
        },
    }


# Keep the import surface intentionally small.
__all__ = ["router", "get_current_user", "require_user", "auth_enabled"]
