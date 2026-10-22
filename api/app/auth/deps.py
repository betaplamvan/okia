"""Dependency: user hiện tại từ `Authorization: Bearer` (docs/13 — Phiên & token)."""

import uuid
from collections.abc import Mapping
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
    if is_banned(user):
        raise AppError("BANNED", 403, until=user.banned_until.isoformat())  # type: ignore[union-attr]
    request.state.user_locale = user.locale
    return user


def is_banned(user: User) -> bool:
    from datetime import UTC, datetime

    return user.banned_until is not None and user.banned_until > datetime.now(UTC)


def is_admin(user: User) -> bool:
    """Admin (docs/13): tài khoản thật, email đã xác minh, nằm trong ADMIN_EMAILS."""
    from app.config import get_settings

    return (
        not user.is_guest
        and user.email is not None
        and user.email_verified_at is not None
        and user.email.lower() in get_settings().admin_email_list
    )


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
    return real_ip(request.headers, request.client.host if request.client else "unknown")


def real_ip(headers: Mapping[str, str], peer: str) -> str:
    """IP người dùng thật. `CF-Connecting-IP` do Cloudflare đặt (client không giả được) được ưu
    tiên; `X-Forwarded-For` chỉ dùng khi không qua Cloudflare (uvicorn --forwarded-allow-ips='*' đã
    tin header này nên `peer` cũng là IP từ XFF)."""
    cf = headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    fwd = headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return peer


def is_loopback(ip: str) -> bool:
    return ip in ("127.0.0.1", "::1", "localhost")


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if not is_admin(user):
        raise AppError("FORBIDDEN", 403)
    return user
