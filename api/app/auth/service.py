"""Nghiệp vụ xác thực (docs/13): khách, email + mật khẩu, phiên refresh, email, gộp tài khoản."""

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import security
from app.auth.emails import send_email
from app.config import get_settings
from app.errors import AppError
from app.i18n import Locale
from app.models import AuthIdentity, Session, User

GUEST_NAME_PREFIX = {"vi": "Bạn", "en": "Player"}


def _now() -> datetime:
    return datetime.now(UTC)


def random_display_name(locale: Locale) -> str:
    """Tên khách ngẫu nhiên kiểu noitu ("Bạn a1b2c3")."""
    return f"{GUEST_NAME_PREFIX[locale]} {secrets.token_hex(3)}"


def verify_link(token: str) -> str:
    return f"{get_settings().app_base_url}/auth/verify?token={token}"


def reset_link(token: str) -> str:
    return f"{get_settings().app_base_url}/auth/reset?token={token}"


# ---------- Truy vấn ----------


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    res = await db.execute(
        select(User)
        .options(selectinload(User.identities))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    return res.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    res = await db.execute(
        select(User)
        .options(selectinload(User.identities))
        .where(User.email == email, User.deleted_at.is_(None))
    )
    return res.scalar_one_or_none()


async def get_identity(db: AsyncSession, provider: str, subject: str) -> AuthIdentity | None:
    res = await db.execute(
        select(AuthIdentity)
        .options(selectinload(AuthIdentity.user).selectinload(User.identities))
        .where(AuthIdentity.provider == provider, AuthIdentity.subject == subject)
    )
    ident = res.scalar_one_or_none()
    if ident and ident.user.deleted_at is not None:
        return None
    return ident


# ---------- Phiên ----------


@dataclass
class Issued:
    access_token: str
    refresh_token: str
    user: User


def access_for(user: User) -> str:
    return security.make_access_token(
        user.id,
        is_guest=user.is_guest,
        email_verified=user.email_verified_at is not None,
        token_version=user.token_version,
    )


async def issue(db: AsyncSession, user: User, user_agent: str | None) -> Issued:
    """Phát access JWT + refresh token mới, ghi `sessions`."""
    raw = security.new_refresh_token()
    db.add(
        Session(
            user_id=user.id,
            refresh_hash=security.hash_refresh_token(raw),
            user_agent=(user_agent or "")[:256] or None,
            expires_at=security.refresh_expiry(),
        )
    )
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])
    return Issued(access_for(user), raw, user)


async def rotate(db: AsyncSession, raw: str, user_agent: str | None) -> Issued:
    """Xoay refresh token. Dùng lại token đã xoay → thu hồi mọi phiên của user (docs/13)."""
    res = await db.execute(
        select(Session).where(Session.refresh_hash == security.hash_refresh_token(raw))
    )
    sess = res.scalar_one_or_none()
    if sess is None:
        raise AppError("UNAUTHORIZED", 401)
    if sess.revoked_at is not None:
        await revoke_all(db, sess.user_id)
        raise AppError("UNAUTHORIZED", 401)
    if sess.expires_at < _now():
        raise AppError("UNAUTHORIZED", 401)
    user = await get_user(db, sess.user_id)
    if user is None:
        raise AppError("UNAUTHORIZED", 401)
    new_raw = security.new_refresh_token()
    new_sess = Session(
        user_id=user.id,
        refresh_hash=security.hash_refresh_token(new_raw),
        user_agent=(user_agent or "")[:256] or None,
        expires_at=security.refresh_expiry(),
    )
    db.add(new_sess)
    await db.flush()
    sess.revoked_at = _now()
    sess.replaced_by = new_sess.id
    await db.commit()
    return Issued(access_for(user), new_raw, user)


async def revoke(db: AsyncSession, raw: str) -> None:
    await db.execute(
        update(Session)
        .where(
            Session.refresh_hash == security.hash_refresh_token(raw), Session.revoked_at.is_(None)
        )
        .values(revoked_at=_now())
    )
    await db.commit()


async def revoke_all(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Session)
        .where(Session.user_id == user_id, Session.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    await db.commit()


# ---------- Khách ----------


async def guest_login(db: AsyncSession, device_id: str, locale: Locale) -> User:
    ident = await get_identity(db, "guest", device_id)
    if ident and ident.user.is_guest:
        return ident.user
    if ident:
        # Thiết bị này từng nâng cấp thành tài khoản thật: không bao giờ cấp lại tài khoản đó
        # mà không có mật khẩu/Google → gỡ identity cũ, tạo khách mới.
        await db.delete(ident)
        await db.flush()
    user = User(display_name=random_display_name(locale), is_guest=True, locale=locale)
    user.identities.append(AuthIdentity(provider="guest", subject=device_id))
    db.add(user)
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])
    return user


async def drop_guest_identities(db: AsyncSession, user: User) -> None:
    """Khi nâng cấp khách: bỏ identity `guest` để device id không mở lại tài khoản thật."""
    for ident in [i for i in user.identities if i.provider == "guest"]:
        user.identities.remove(ident)
        await db.delete(ident)
    await db.flush()


# ---------- Email + mật khẩu ----------


@dataclass
class RegisterOutcome:
    user: (
        User | None
    )  # None → email đã có tài khoản (đã gửi email cảnh báo), phản hồi như thành công
    verify_token: str | None


async def register(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    display_name: str | None,
    locale: Locale,
    current: User | None,
) -> RegisterOutcome:
    if security.is_weak_password(password, email):
        raise AppError("WEAK_PASSWORD", 422)
    existing = await get_user_by_email(db, email)
    if existing is not None:
        # Không tiết lộ email đã có tài khoản: gửi email cảnh báo, trả như thành công.
        return RegisterOutcome(None, None)
    if current is not None and current.is_guest:
        user = current  # nâng cấp chính user khách, giữ user_id (docs/13 — Gộp tài khoản)
        await drop_guest_identities(db, user)
        user.is_guest = False
        user.email = email
        user.locale = locale
        if display_name:
            user.display_name = display_name
    else:
        user = User(
            display_name=display_name or random_display_name(locale),
            is_guest=False,
            email=email,
            locale=locale,
        )
        db.add(user)
    user.identities.append(
        AuthIdentity(
            provider="password", subject=email, secret_hash=security.hash_password(password)
        )
    )
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])
    return RegisterOutcome(user, security.make_email_token(user.id, "verify", email=email))


async def login(db: AsyncSession, *, email: str, password: str) -> User:
    ident = await get_identity(db, "password", email)
    # Luôn chạy verify để thời gian phản hồi không lộ email có tồn tại hay không.
    hashed = ident.secret_hash if ident and ident.secret_hash else security.hash_password("x")
    ok = security.verify_password(hashed, password)
    if ident is None or not ok:
        raise AppError("INVALID_CREDENTIALS", 401)
    user = ident.user
    if user.banned_until and user.banned_until > _now():
        raise AppError("BANNED", 403)
    return user


async def set_password(db: AsyncSession, user: User, password: str) -> None:
    if user.email is None:
        raise AppError("GUEST_NOT_ALLOWED", 403)
    if security.is_weak_password(password, user.email):
        raise AppError("WEAK_PASSWORD", 422)
    for ident in user.identities:
        if ident.provider == "password":
            raise AppError("IDENTITY_EXISTS", 409)
    user.identities.append(
        AuthIdentity(
            provider="password", subject=user.email, secret_hash=security.hash_password(password)
        )
    )
    await db.commit()


async def remove_identity(db: AsyncSession, user: User, provider: str) -> None:
    if user.is_guest:
        raise AppError("GUEST_NOT_ALLOWED", 403)
    target = next((i for i in user.identities if i.provider == provider), None)
    if target is None:
        raise AppError("NOT_FOUND", 404)
    remaining = [i for i in user.identities if i.provider not in ("guest", provider)]
    if not remaining:
        raise AppError("LAST_IDENTITY", 409)
    await db.delete(target)
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])


# ---------- Token email một lần ----------


async def _consume_once(redis: Redis, payload: dict) -> None:
    jti = payload["jti"]
    ttl = max(1, int(payload["exp"] - _now().timestamp()))
    if not await redis.set(f"token:used:{jti}", "1", ex=ttl, nx=True):
        raise AppError("TOKEN_USED", 400)


async def verify_email(db: AsyncSession, redis: Redis, token: str) -> User:
    try:
        payload = security.decode_token(token, "verify")
    except security.TokenError as e:
        raise AppError(e.code, 400) from e
    user = await get_user(db, uuid.UUID(payload["sub"]))
    if user is None or user.email != payload.get("email"):
        raise AppError("TOKEN_INVALID", 400)
    await _consume_once(redis, payload)
    if user.email_verified_at is None:
        user.email_verified_at = _now()
        await db.commit()
    return user


async def reset_password(db: AsyncSession, redis: Redis, token: str, password: str) -> User:
    try:
        payload = security.decode_token(token, "reset")
    except security.TokenError as e:
        raise AppError(e.code, 400) from e
    user = await get_user(db, uuid.UUID(payload["sub"]))
    if user is None or user.email is None:
        raise AppError("TOKEN_INVALID", 400)
    if security.is_weak_password(password, user.email):
        raise AppError("WEAK_PASSWORD", 422)
    await _consume_once(redis, payload)
    ident = next((i for i in user.identities if i.provider == "password"), None)
    if ident is None:
        ident = AuthIdentity(provider="password", subject=user.email, secret_hash="")
        user.identities.append(ident)
    ident.secret_hash = security.hash_password(password)
    user.token_version += 1  # vô hiệu mọi phiên cũ
    if user.email_verified_at is None:
        user.email_verified_at = _now()  # nhận được email đặt lại = email là của họ
    await revoke_all(db, user.id)
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])
    return user


# ---------- Gửi email ----------


async def send_verify(user: User, token: str) -> None:
    if user.email and user.email_bounced_at is None:
        await send_email(
            "verify",
            to=user.email,
            locale=user.locale,  # type: ignore[arg-type]
            user_id=str(user.id),
            name=user.display_name,
            link=verify_link(token),
        )


async def send_duplicate_warning(email: str, locale: Locale) -> None:
    await send_email("duplicate", to=email, locale=locale, user_id="-")


async def send_reset_or_google_hint(user: User) -> None:
    if not user.email or user.email_bounced_at is not None:
        return
    has_password = any(i.provider == "password" for i in user.identities)
    if has_password:
        token = security.make_email_token(user.id, "reset")
        await send_email(
            "reset",
            to=user.email,
            locale=user.locale,  # type: ignore[arg-type]
            user_id=str(user.id),
            name=user.display_name,
            link=reset_link(token),
        )
    else:
        await send_email(
            "google_only",
            to=user.email,
            locale=user.locale,  # type: ignore[arg-type]
            user_id=str(user.id),
            name=user.display_name,
        )


# ---------- Hồ sơ ----------


async def update_me(
    db: AsyncSession, user: User, *, display_name: str | None, locale: Locale | None
) -> User:
    if display_name is not None:
        user.display_name = display_name
    if locale is not None:
        user.locale = locale
    await db.commit()
    return user


async def soft_delete(db: AsyncSession, user: User) -> None:
    """Xóa mềm: ẩn ngay, identity + session xóa ngay để không đăng nhập lại (docs/13)."""
    for ident in list(user.identities):
        await db.delete(ident)
    user.deleted_at = _now()
    user.token_version += 1
    user.email = None  # giải phóng email để người dùng có thể đăng ký lại
    await revoke_all(db, user.id)
    await db.commit()


async def drop_guest(db: AsyncSession, guest: User | None) -> None:
    """Khách chuyển sang tài khoản đã có → bỏ user khách (xóa mềm)."""
    if guest is not None and guest.is_guest:
        await soft_delete(db, guest)
