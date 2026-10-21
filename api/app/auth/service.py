"""Nghiệp vụ xác thực (docs/13): khách, phiên refresh, gộp tài khoản, email chào mừng.

Chỉ còn hai cách vào game: khách (device id) và Google (ADR-0011) — không có mật khẩu.
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

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
    """Phát access JWT + refresh token mới, ghi `sessions`.

    Tài khoản thật chỉ giữ một phiên (docs/13 — Một phiên mỗi tài khoản): lần đăng nhập mới thu
    hồi mọi phiên khác với lý do `replaced` và tăng `token_version` để access token cũ chết ngay.
    Router lo phần đá kết nối WS. Khách không áp dụng: device id chỉ sống trong một trình duyệt,
    và hai nơi chung device id sẽ tự đăng nhập khách đá nhau mãi.
    """
    if not user.is_guest:
        await db.execute(
            update(Session)
            .where(Session.user_id == user.id, Session.revoked_at.is_(None))
            .values(revoked_at=_now(), revoked_reason="replaced")
        )
        user.token_version += 1
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
    """Xoay refresh token. Dùng lại token đã xoay → thu hồi mọi phiên của user (docs/13).
    Token bị thay bởi lần đăng nhập nơi khác → `SESSION_REPLACED` (client báo cho người dùng)."""
    res = await db.execute(
        select(Session).where(Session.refresh_hash == security.hash_refresh_token(raw))
    )
    sess = res.scalar_one_or_none()
    if sess is None:
        raise AppError("UNAUTHORIZED", 401)
    if sess.revoked_reason == "replaced":
        raise AppError("SESSION_REPLACED", 401)
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
        # mà không qua Google → gỡ identity cũ, tạo khách mới.
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


# ---------- Email ----------


async def send_welcome(user: User) -> None:
    """Thư chào mừng khi tài khoản Google vừa được tạo / khách vừa nâng cấp."""
    if not user.email or user.email_bounced_at is not None:
        return
    await send_email(
        "welcome",
        to=user.email,
        locale=user.locale,  # type: ignore[arg-type]
        user_id=str(user.id),
        name=user.display_name,
        link=get_settings().app_base_url,
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
    user.email = None  # giải phóng email để người dùng có thể tạo lại tài khoản
    await revoke_all(db, user.id)
    await db.commit()


async def drop_guest(db: AsyncSession, guest: User | None) -> None:
    """Khách chuyển sang tài khoản đã có → bỏ user khách (xóa mềm)."""
    if guest is not None and guest.is_guest:
        await soft_delete(db, guest)
