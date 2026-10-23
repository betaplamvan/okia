"""Endpoint /auth/* và /me (docs/13): khách, phiên, Google, hồ sơ. Không có mật khẩu (ADR-0011)."""

import uuid
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import config as appconfig
from app.auth import google, ratelimit, service, ws_cache
from app.auth.deps import client_ip, current_user, get_redis, is_admin, is_banned, optional_user
from app.auth.schemas import (
    DevLoginIn,
    GoogleStartOut,
    GuestIn,
    IdentityOut,
    LoadoutBrief,
    MePatch,
    OkOut,
    TokenOut,
    UserOut,
    WalletBrief,
)
from app.config import get_settings
from app.db import get_db
from app.errors import AppError
from app.i18n import Locale, resolve_locale
from app.models import AuthIdentity, User

router = APIRouter(tags=["auth"])

REFRESH_COOKIE = "okia_refresh"
Db = Annotated[AsyncSession, Depends(get_db)]
Rd = Annotated[Redis, Depends(get_redis)]


# ---------- Tiện ích ----------


def to_user_out(user: User) -> UserOut:
    from sqlalchemy import inspect
    from sqlalchemy.orm.base import NO_VALUE

    from app.economy.router import avatar_url_for
    from app.skins import catalog

    # Ví / loadout chỉ đọc khi đã nạp (selectin lúc query); user vừa tạo trong session → mặc định.
    loaded = inspect(user).attrs.wallet.loaded_value
    w = None if loaded is NO_VALUE else loaded
    lo_loaded = inspect(user).attrs.loadout.loaded_value
    lo = None if lo_loaded is NO_VALUE else lo_loaded
    loadout = catalog.default_loadout()
    if lo is not None:
        for t in catalog.TYPES:
            sid = getattr(lo, t)
            s = catalog.get_skin(sid) if sid else None
            if s is not None and s.type == t:
                loadout[t] = sid
    return UserOut(
        id=user.id,
        display_name=user.display_name,
        avatar_url=avatar_url_for(user),
        has_custom_avatar=user.avatar_version > 0,
        wallet=WalletBrief(lead=w.lead if w else 0, flower=w.flower if w else 0),
        loadout=LoadoutBrief(**loadout),
        email=user.email,
        email_verified=user.email_verified_at is not None,
        is_guest=user.is_guest,
        is_admin=is_admin(user),
        ad_free=user.ad_free_at is not None,
        locale=user.locale,  # type: ignore[arg-type]
        created_at=user.created_at,
        identities=[
            IdentityOut(provider=i.provider) for i in user.identities if i.provider != "guest"
        ],
    )


def set_refresh_cookie(response: Response, raw: str) -> None:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=s.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/auth",
        domain=s.cookie_domain,
    )


def clear_refresh_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(REFRESH_COOKIE, path="/auth", domain=s.cookie_domain)


async def _login(db: AsyncSession, request: Request, user: User) -> service.Issued:
    """Phát phiên mới. Tài khoản thật: phiên ở nơi khác vừa bị thu hồi (service.issue) → đá luôn
    các kết nối WS đang mở của tài khoản trên mọi tiến trình."""
    from app.ws.endpoint import CLOSE_SESSION_REPLACED

    if is_banned(user):
        raise AppError("BANNED", 403, until=user.banned_until.isoformat())  # type: ignore[union-attr]
    issued = await service.issue(db, user, request.headers.get("user-agent"))
    await ws_cache.invalidate(request.app.state.redis, user.id)
    if not user.is_guest:
        await request.app.state.hub.kick_user(str(user.id), CLOSE_SESSION_REPLACED)
    return issued


async def _issue(
    db: AsyncSession, request: Request, response: Response, user: User, *, switched: bool = False
) -> TokenOut:
    issued = await _login(db, request, user)
    set_refresh_cookie(response, issued.refresh_token)
    return TokenOut(
        access_token=issued.access_token,
        expires_in=get_settings().access_token_ttl_seconds,
        user=to_user_out(issued.user),
        switched=switched,
    )


def req_locale(request: Request, explicit: str | None = None) -> Locale:
    return resolve_locale(None, request.headers.get("accept-language"), explicit)


# ---------- Khách & phiên ----------


@router.post("/auth/guest", response_model=TokenOut)
async def guest(body: GuestIn, request: Request, response: Response, db: Db, redis: Rd) -> TokenOut:
    await ratelimit.hit(
        redis, f"guest:{client_ip(request)}", appconfig.get_int("guest_per_ip_per_hour", 30), 3600
    )
    user = await service.guest_login(db, body.device_id, req_locale(request, body.locale))
    return await _issue(db, request, response, user)


@router.post("/auth/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response, db: Db) -> TokenOut:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise AppError("UNAUTHORIZED", 401)
    # CSRF: SameSite=Lax + kiểm tra Origin khi có (docs/13 — Bảo mật).
    origin = request.headers.get("origin")
    if origin and origin not in get_settings().cors_origin_list:
        raise AppError("UNAUTHORIZED", 401)
    try:
        issued = await service.rotate(db, raw, request.headers.get("user-agent"))
    except AppError:
        clear_refresh_cookie(response)
        raise
    if is_banned(issued.user):
        clear_refresh_cookie(response)
        raise AppError("BANNED", 403, until=issued.user.banned_until.isoformat())  # type: ignore[union-attr]
    set_refresh_cookie(response, issued.refresh_token)
    return TokenOut(
        access_token=issued.access_token,
        expires_in=get_settings().access_token_ttl_seconds,
        user=to_user_out(issued.user),
    )


@router.post("/auth/logout", response_model=OkOut)
async def logout(request: Request, response: Response, db: Db) -> OkOut:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        await service.revoke(db, raw)
    clear_refresh_cookie(response)
    return OkOut()


@router.post("/auth/logout-all", response_model=OkOut)
async def logout_all(
    request: Request,
    response: Response,
    db: Db,
    user: Annotated[User, Depends(current_user)],
) -> OkOut:
    """Đăng xuất mọi thiết bị: tăng token_version + thu hồi mọi refresh."""
    user.token_version += 1
    await service.revoke_all(db, user.id)
    await ws_cache.invalidate(request.app.state.redis, user.id)
    clear_refresh_cookie(response)
    return OkOut()


# ---------- Google ----------


@router.post("/auth/google/start", response_model=GoogleStartOut)
async def google_start(
    request: Request,
    redis: Rd,
    current: Annotated[User | None, Depends(optional_user)],
    return_to: str = "/",
) -> GoogleStartOut:
    """Client gọi (kèm Bearer nếu có) rồi chuyển hướng tới URL trả về."""
    if not return_to.startswith("/") or return_to.startswith("//"):
        return_to = "/"
    ctx = google.StartContext(
        user_id=str(current.id) if current else None,
        locale=current.locale if current else req_locale(request),
        return_to=return_to,
    )
    return GoogleStartOut(url=await google.start(redis, ctx))


@router.get("/auth/google/callback", include_in_schema=False)
async def google_callback(
    request: Request,
    tasks: BackgroundTasks,
    db: Db,
    redis: Rd,
    state: str = "",
    code: str = "",
    error: str = "",
) -> Response:
    base = get_settings().app_base_url

    def back(return_to: str, **q: str) -> RedirectResponse:
        return RedirectResponse(f"{base}{return_to}?{urlencode(q)}", status_code=303)

    try:
        verifier, ctx = await google.pop_state(redis, state)
    except AppError as e:
        return back("/", auth="error", code=e.code)
    if error or not code:
        return back(ctx.return_to, auth="error", code="OAUTH_CANCELLED")
    try:
        profile = await google.exchange(code, verifier)
        current = await service.get_user(db, uuid.UUID(ctx.user_id)) if ctx.user_id else None
        user, switched, created = await link_or_login_google(db, profile, current, ctx.locale)
    except AppError as e:
        return back(ctx.return_to, auth="error", code=e.code)
    if switched and current is not None:
        # Khách vừa bị bỏ (xóa mềm, token_version tăng) → bỏ cache đường nối WS của khách.
        await ws_cache.invalidate(redis, current.id)
    if created:
        tasks.add_task(service.send_welcome, user)
    issued = await _login(db, request, user)
    resp = back(ctx.return_to, auth="google", switched="1" if switched else "0")
    set_refresh_cookie(resp, issued.refresh_token)
    return resp


async def link_or_login_google(
    db: AsyncSession, profile: google.GoogleProfile, current: User | None, locale: str
) -> tuple[User, bool, bool]:
    """Luồng docs/13 — Google OAuth + Gộp tài khoản. Trả (user, switched, created).

    `created`: tài khoản thật vừa xuất hiện (tạo mới hoặc khách nâng cấp) → gửi thư chào mừng.
    """
    from datetime import UTC, datetime

    ident = await service.get_identity(db, "google", profile.sub)
    if ident is not None:
        owner = ident.user
        if current is not None and not current.is_guest and current.id != owner.id:
            raise AppError("IDENTITY_TAKEN", 409)
        switched = current is not None and current.id != owner.id
        if switched:
            await service.drop_guest(db, current)
        return owner, switched, False

    by_email = await service.get_user_by_email(db, profile.email)
    if by_email is not None and by_email.email_verified_at is not None:
        # Tài khoản cũ cùng email đã xác minh (vd. tạo trước ADR-0011) → liên kết Google vào.
        if current is not None and not current.is_guest and current.id != by_email.id:
            raise AppError("IDENTITY_TAKEN", 409)
        target = by_email
        switched = current is not None and current.id != target.id
        if switched:
            await service.drop_guest(db, current)
        created = False
    elif by_email is not None:
        # Email trùng nhưng tài khoản kia chưa xác minh → không tự gộp (an toàn).
        raise AppError("IDENTITY_TAKEN", 409)
    elif current is not None:
        # Nâng cấp khách / thêm Google vào tài khoản đang đăng nhập.
        target = current
        switched = False
        created = target.is_guest
        if target.is_guest:
            await service.drop_guest_identities(db, target)
            target.is_guest = False
            target.email = profile.email
            target.email_verified_at = datetime.now(UTC)
            if profile.name:
                target.display_name = profile.name[:32]
        elif target.email is None:
            target.email = profile.email
            target.email_verified_at = datetime.now(UTC)
    else:
        target = User(
            display_name=(profile.name or service.random_display_name(locale))[:32],  # type: ignore[arg-type]
            is_guest=False,
            email=profile.email,
            email_verified_at=datetime.now(UTC),
            locale=locale,
        )
        db.add(target)
        switched = False
        created = True
    if target.avatar_url is None and profile.picture:
        target.avatar_url = profile.picture[:512]
    target.identities.append(AuthIdentity(provider="google", subject=profile.sub))
    await db.commit()
    await db.refresh(target, attribute_names=["identities"])
    return target, switched, created


@router.post("/auth/dev-login", response_model=TokenOut, include_in_schema=False)
async def dev_login(
    body: DevLoginIn,
    request: Request,
    response: Response,
    db: Db,
    current: Annotated[User | None, Depends(optional_user)],
) -> TokenOut:
    """Chỉ ngoài production (smoke test, dev): tài khoản đã xác minh theo email, không qua Google,
    không gửi thư. Đi đúng luồng gộp tài khoản như Google với subject `dev:<email>`."""
    if get_settings().env == "production":
        raise AppError("NOT_FOUND", 404)
    profile = google.GoogleProfile(
        sub=f"dev:{body.email}", email=body.email, name=body.display_name, picture=None
    )
    user, switched, _ = await link_or_login_google(db, profile, current, req_locale(request))
    if switched and current is not None:
        await ws_cache.invalidate(request.app.state.redis, current.id)
    if body.lead or body.flower:
        from app.economy import wallet

        await wallet.grant(
            db,
            user.id,
            {"lead": body.lead, "flower": body.flower},
            source="admin",
            ref="dev-login",
            idempotency_key=f"dev:{user.id}:{uuid.uuid4()}",
        )
        await db.commit()
        await db.refresh(user, attribute_names=["wallet", "identities"])
    return await _issue(db, request, response, user, switched=switched)


# ---------- Hồ sơ ----------


@router.get("/me", response_model=UserOut, tags=["me"])
async def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return to_user_out(user)


@router.patch("/me", response_model=UserOut, tags=["me"])
async def patch_me(
    body: MePatch, db: Db, redis: Rd, user: Annotated[User, Depends(current_user)]
) -> UserOut:
    await service.update_me(db, user, display_name=body.display_name, locale=body.locale)
    await ws_cache.invalidate(redis, user.id)
    return to_user_out(user)


@router.delete("/me", response_model=OkOut, tags=["me"])
async def delete_me(
    response: Response, db: Db, redis: Rd, user: Annotated[User, Depends(current_user)]
) -> OkOut:
    await service.soft_delete(db, user)
    await ws_cache.invalidate(redis, user.id)
    clear_refresh_cookie(response)
    return OkOut()
