"""Endpoint /auth/* và /me (docs/13)."""

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import google, ratelimit, service
from app.auth.deps import account_user, client_ip, current_user, get_redis, optional_user
from app.auth.schemas import (
    ForgotIn,
    GoogleStartOut,
    GuestIn,
    IdentityOut,
    LoginIn,
    MePatch,
    OkOut,
    RegisterIn,
    ResetIn,
    SetPasswordIn,
    TokenOut,
    UserOut,
    VerifyIn,
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
    def ident(i: AuthIdentity) -> IdentityOut:
        return IdentityOut(
            provider=i.provider, subject=i.subject if i.provider == "password" else None
        )

    from sqlalchemy import inspect
    from sqlalchemy.orm.base import NO_VALUE

    from app.economy.router import avatar_url_for

    # Ví chỉ đọc khi đã nạp (selectin lúc query); user vừa tạo trong session thì chưa có ví → 0.
    loaded = inspect(user).attrs.wallet.loaded_value
    w = None if loaded is NO_VALUE else loaded
    return UserOut(
        id=user.id,
        display_name=user.display_name,
        avatar_url=avatar_url_for(user),
        has_custom_avatar=user.avatar_version > 0,
        wallet=WalletBrief(lead=w.lead if w else 0, flower=w.flower if w else 0),
        email=user.email,
        email_verified=user.email_verified_at is not None,
        is_guest=user.is_guest,
        locale=user.locale,  # type: ignore[arg-type]
        created_at=user.created_at,
        identities=[ident(i) for i in user.identities if i.provider != "guest"],
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


async def _issue(
    db: AsyncSession, request: Request, response: Response, user: User, *, switched: bool = False
) -> TokenOut:
    issued = await service.issue(db, user, request.headers.get("user-agent"))
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
    await ratelimit.hit(redis, f"guest:{client_ip(request)}", 30, 3600)
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
    clear_refresh_cookie(response)
    return OkOut()


# ---------- Email + mật khẩu ----------


@router.post("/auth/register", response_model=TokenOut)
async def register(
    body: RegisterIn,
    request: Request,
    response: Response,
    tasks: BackgroundTasks,
    db: Db,
    redis: Rd,
    current: Annotated[User | None, Depends(optional_user)],
) -> TokenOut:
    ip = client_ip(request)
    await ratelimit.hit(redis, f"register:ip:{ip}", 10, 3600)
    await ratelimit.hit(redis, f"register:email:{body.email}", 3, 3600)
    if current is not None and not current.is_guest:
        raise AppError("ALREADY_ACCOUNT", 409)
    locale = req_locale(request, body.locale)
    out = await service.register(
        db,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        locale=locale,
        current=current,
    )
    if out.user is None:
        # Email đã có tài khoản: phản hồi y như thành công (giữ phiên hiện tại), gửi email cảnh báo.
        tasks.add_task(service.send_duplicate_warning, body.email, locale)
        if current is None:
            raise AppError("CHECK_EMAIL", 202)
        return await _issue(db, request, response, current)
    assert out.verify_token
    tasks.add_task(service.send_verify, out.user, out.verify_token)
    return await _issue(db, request, response, out.user)


@router.post("/auth/login", response_model=TokenOut)
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: Db,
    redis: Rd,
    current: Annotated[User | None, Depends(optional_user)],
) -> TokenOut:
    ip = client_ip(request)
    await ratelimit.hit(redis, f"login:ip:{ip}", 20, 900)
    await ratelimit.hit(redis, f"login:email:{body.email}", 5, 900)
    user = await service.login(db, email=body.email, password=body.password)
    await ratelimit.clear(redis, f"login:email:{body.email}")
    switched = current is not None and current.is_guest and current.id != user.id
    if switched:
        await service.drop_guest(db, current)
    return await _issue(db, request, response, user, switched=switched)


@router.post("/auth/verify", response_model=TokenOut)
async def verify(
    body: VerifyIn, request: Request, response: Response, db: Db, redis: Rd
) -> TokenOut:
    user = await service.verify_email(db, redis, body.token)
    return await _issue(db, request, response, user)


@router.post("/auth/resend-verify", response_model=OkOut)
async def resend_verify(
    tasks: BackgroundTasks,
    redis: Rd,
    user: Annotated[User, Depends(account_user)],
) -> OkOut:
    if user.email_verified_at is not None or not user.email:
        return OkOut()
    await ratelimit.hit(redis, f"resend:{user.id}", 3, 3600)
    from app.auth import security

    tasks.add_task(
        service.send_verify, user, security.make_email_token(user.id, "verify", email=user.email)
    )
    return OkOut()


@router.post("/auth/forgot", response_model=OkOut)
async def forgot(
    body: ForgotIn, request: Request, tasks: BackgroundTasks, db: Db, redis: Rd
) -> OkOut:
    await ratelimit.hit(redis, f"forgot:ip:{client_ip(request)}", 10, 3600)
    await ratelimit.hit(redis, f"forgot:email:{body.email}", 3, 3600)
    user = await service.get_user_by_email(db, body.email)
    if user is not None and not user.is_guest:
        tasks.add_task(service.send_reset_or_google_hint, user)
    return OkOut()  # luôn thành công, không tiết lộ email có tài khoản


@router.post("/auth/reset", response_model=TokenOut)
async def reset(body: ResetIn, request: Request, response: Response, db: Db, redis: Rd) -> TokenOut:
    user = await service.reset_password(db, redis, body.token, body.password)
    return await _issue(db, request, response, user)


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
        current = (
            await service.get_user(db, __import__("uuid").UUID(ctx.user_id))
            if ctx.user_id
            else None
        )
        user, switched = await link_or_login_google(db, profile, current, ctx.locale)
    except AppError as e:
        return back(ctx.return_to, auth="error", code=e.code)
    issued = await service.issue(db, user, request.headers.get("user-agent"))
    resp = back(ctx.return_to, auth="google", switched="1" if switched else "0")
    set_refresh_cookie(resp, issued.refresh_token)
    return resp


async def link_or_login_google(
    db: AsyncSession, profile: google.GoogleProfile, current: User | None, locale: str
) -> tuple[User, bool]:
    """Luồng docs/13 — Google OAuth + Gộp tài khoản. Trả (user, switched)."""
    from datetime import UTC, datetime

    ident = await service.get_identity(db, "google", profile.sub)
    if ident is not None:
        owner = ident.user
        if current is not None and not current.is_guest and current.id != owner.id:
            raise AppError("IDENTITY_TAKEN", 409)
        switched = current is not None and current.id != owner.id
        if switched:
            await service.drop_guest(db, current)
        return owner, switched

    by_email = await service.get_user_by_email(db, profile.email)
    if by_email is not None and by_email.email_verified_at is not None:
        # Tự liên kết: cả hai phía đã xác minh cùng email.
        if current is not None and not current.is_guest and current.id != by_email.id:
            raise AppError("IDENTITY_TAKEN", 409)
        target = by_email
        switched = current is not None and current.id != target.id
        if switched:
            await service.drop_guest(db, current)
    elif by_email is not None:
        # Email trùng nhưng tài khoản kia chưa xác minh → không tự gộp (an toàn).
        raise AppError("IDENTITY_TAKEN", 409)
    elif current is not None:
        # Nâng cấp khách / thêm Google vào tài khoản đang đăng nhập.
        target = current
        switched = False
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
    if target.avatar_url is None and profile.picture:
        target.avatar_url = profile.picture[:512]
    target.identities.append(AuthIdentity(provider="google", subject=profile.sub))
    await db.commit()
    await db.refresh(target, attribute_names=["identities"])
    return target, switched


# ---------- Hồ sơ ----------


@router.get("/me", response_model=UserOut, tags=["me"])
async def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return to_user_out(user)


@router.patch("/me", response_model=UserOut, tags=["me"])
async def patch_me(body: MePatch, db: Db, user: Annotated[User, Depends(current_user)]) -> UserOut:
    await service.update_me(db, user, display_name=body.display_name, locale=body.locale)
    return to_user_out(user)


@router.delete("/me", response_model=OkOut, tags=["me"])
async def delete_me(
    response: Response, db: Db, user: Annotated[User, Depends(current_user)]
) -> OkOut:
    await service.soft_delete(db, user)
    clear_refresh_cookie(response)
    return OkOut()


@router.post("/me/password", response_model=UserOut, tags=["me"])
async def me_set_password(
    body: SetPasswordIn, db: Db, user: Annotated[User, Depends(account_user)]
) -> UserOut:
    await service.set_password(db, user, body.password)
    return to_user_out(user)


@router.delete("/me/identities/{provider}", response_model=UserOut, tags=["me"])
async def me_remove_identity(
    provider: str, db: Db, user: Annotated[User, Depends(account_user)]
) -> UserOut:
    if provider not in ("password", "google"):
        raise AppError("NOT_FOUND", 404)
    await service.remove_identity(db, user, provider)
    return to_user_out(user)
