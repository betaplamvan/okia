"""Access JWT và refresh token (docs/13 — Phiên & token). Không còn mật khẩu (ADR-0011)."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt

from app.config import get_settings

Purpose = Literal["access"]


def _now() -> datetime:
    return datetime.now(UTC)


# ---------- JWT ----------


def make_access_token(
    user_id: uuid.UUID, *, is_guest: bool, email_verified: bool, token_version: int
) -> str:
    s = get_settings()
    now = _now()
    payload = {
        "sub": str(user_id),
        "purpose": "access",
        "is_guest": is_guest,
        "email_verified": email_verified,
        "tv": token_version,
        "iat": now,
        "exp": now + timedelta(seconds=s.access_token_ttl_seconds),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


class TokenError(Exception):
    def __init__(self, code: Literal["TOKEN_INVALID", "TOKEN_EXPIRED"]) -> None:
        super().__init__(code)
        self.code = code


def decode_token(token: str, purpose: Purpose = "access") -> dict[str, Any]:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise TokenError("TOKEN_EXPIRED") from e
    except jwt.PyJWTError as e:
        raise TokenError("TOKEN_INVALID") from e
    if payload.get("purpose") != purpose:
        raise TokenError("TOKEN_INVALID")
    return payload


# ---------- Refresh token ----------


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)  # 256 bit


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def refresh_expiry() -> datetime:
    return _now() + timedelta(days=get_settings().refresh_token_ttl_days)
