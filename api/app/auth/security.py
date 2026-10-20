"""Mật khẩu (Argon2id), access JWT, refresh token, token một lần cho email (docs/13)."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

# Tham số mặc định của argon2-cffi (Argon2id); khi test hạ xuống để suite chạy nhanh.
_hasher = (
    PasswordHasher(time_cost=1, memory_cost=8 * 1024, parallelism=1)
    if get_settings().env == "test"
    else PasswordHasher()
)
_COMMON = frozenset(
    (Path(__file__).parent / "common_passwords.txt").read_text(encoding="utf-8").split()
)

Purpose = Literal["access", "verify", "reset"]


# ---------- Mật khẩu ----------


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except VerifyMismatchError:
        return False
    except Exception:  # hash hỏng / không phải argon2
        return False


def is_weak_password(password: str, email: str | None = None) -> bool:
    """< 8 ký tự, > 128, nằm trong danh sách phổ biến, hoặc trùng phần tên của email."""
    if not 8 <= len(password) <= 128:
        return True
    low = password.lower()
    if low in _COMMON:
        return True
    if email:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 4 and local == low:
            return True
    return False


# ---------- JWT ----------


def _now() -> datetime:
    return datetime.now(UTC)


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


def make_email_token(user_id: uuid.UUID, purpose: Literal["verify", "reset"], **extra: Any) -> str:
    """Token trong link email: có `jti` để chỉ dùng một lần (ghi Redis khi dùng)."""
    s = get_settings()
    ttl = (
        timedelta(hours=s.verify_token_ttl_hours)
        if purpose == "verify"
        else timedelta(minutes=s.reset_token_ttl_minutes)
    )
    now = _now()
    payload = {
        "sub": str(user_id),
        "purpose": purpose,
        "jti": secrets.token_urlsafe(16),
        "iat": now,
        "exp": now + ttl,
        **extra,
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


class TokenError(Exception):
    def __init__(self, code: Literal["TOKEN_INVALID", "TOKEN_EXPIRED"]) -> None:
        super().__init__(code)
        self.code = code


def decode_token(token: str, purpose: Purpose) -> dict[str, Any]:
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
