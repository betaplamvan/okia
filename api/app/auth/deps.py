"""Dependency: user hiện tại từ `Authorization: Bearer` (docs/13 — Phiên & token)."""

import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security, service
from app.db import get_db
from app.errors import AppError
from app.models import User

_bearer = HTTPBearer(auto_error=False)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


async def optional_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User | None:
    """None nếu không có token. Token sai/hết hạn → 401 (client sẽ refresh)."""
    if creds is None:
        return None
    try:
        payload = security.decode_token(creds.credentials, "access")
    except security.TokenError as e:
        raise AppError("UNAUTHORIZED", 401) from e
    user = await service.get_user(db, uuid.UUID(payload["sub"]))
    if user is None or payload.get("tv") != user.token_version:
        raise AppError("UNAUTHORIZED", 401)
    request.state.user_locale = user.locale
    return user


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise AppError("UNAUTHORIZED", 401)
    return user


async def account_user(user: Annotated[User, Depends(current_user)]) -> User:
    """Tính năng cần tài khoản thật (không phải khách)."""
    if user.is_guest:
        raise AppError("GUEST_NOT_ALLOWED", 403)
    return user


async def verified_user(user: Annotated[User, Depends(account_user)]) -> User:
    """Xếp hạng, Ruột chì: phải xác minh email (docs/13)."""
    if user.email_verified_at is None:
        raise AppError("EMAIL_NOT_VERIFIED", 403)
    return user


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
