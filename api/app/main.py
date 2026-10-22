"""Ứng dụng FastAPI (docs/02). Server quyết định mọi kết quả; client chỉ gửi ý định."""

import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis.asyncio as redis
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.config import Settings, get_settings
from app.db import dispose_engine, get_db
from app.economy.router import router as economy_router
from app.errors import install_error_handlers
from app.game.timer import TimerWorker
from app.i18n import Locale, resolve_locale, t
from app.matchmaking.worker import MatchmakingWorker
from app.rating.router import router as rating_router
from app.skins.router import router as skins_router
from app.ws.endpoint import router as ws_router
from app.ws.hub import Hub


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.redis = redis.from_url(settings.redis_url, decode_responses=True)
    app.state.hub = Hub(app.state.redis)
    await app.state.hub.start()
    timer = TimerWorker(app.state.redis, app.state.hub)
    timer.start()
    mm = MatchmakingWorker(app.state.redis, app.state.hub)
    mm.start()
    # Catalog skin + thông số admin: seed từ bản chép, đọc DB, rồi đọc lại định kỳ (docs/08, 13).
    import asyncio

    from app.admin import config as appconfig
    from app.db import get_session_factory
    from app.skins import catalog

    async with get_session_factory()() as db:
        await catalog.seed(db)
        await db.commit()
        await catalog.sync_from_db(db)
        await appconfig.sync_from_db(db)
    refresher = asyncio.create_task(catalog.refresh_loop(), name="catalog-refresh")
    try:
        yield
    finally:
        from app.game import botplay

        refresher.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await refresher
        await botplay.cancel_all()
        await mm.stop()
        await timer.stop()
        await app.state.hub.stop()
        await app.state.redis.aclose()
        await dispose_engine()


def get_locale(request: Request) -> Locale:
    """Locale của request (docs/11): users.locale (khi có auth) → Accept-Language → vi."""
    user_locale = getattr(request.state, "user_locale", None)
    return resolve_locale(user_locale, request.headers.get("accept-language"))


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Ô Kìa API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        # Dev: chấp nhận thêm origin từ dải IP riêng (RFC 1918) / tên .local để máy khác trong LAN
        # mở web qua http://<ip>:3000 gọi được API. Production chỉ dùng CORS_ORIGINS.
        allow_origin_regex=(
            r"^https?://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+"
            r"|[\w-]+\.local|localhost|127\.0\.0\.1)(:\d+)?$"
            if settings.env != "production"
            else None
        ),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],  # tên file xuất gói skin (admin)
    )
    install_error_handlers(app)
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(economy_router)
    app.include_router(rating_router)
    app.include_router(skins_router)
    app.include_router(ws_router)

    @app.get("/healthz", tags=["ops"])
    async def healthz() -> dict[str, str]:
        """Tiến trình còn sống (không chạm DB)."""
        return {"status": "ok"}

    @app.get("/readyz", tags=["ops"])
    async def readyz(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
        """Sẵn sàng nhận request: DB và Redis trả lời."""
        await db.execute(text("SELECT 1"))
        await request.app.state.redis.ping()
        return {"status": "ready"}

    @app.get("/i18n/demo", tags=["ops"], include_in_schema=False)
    async def i18n_demo(locale: Locale = Depends(get_locale)) -> dict[str, str]:
        return {"locale": locale, "message": t("errors.NOT_YOUR_TURN", locale)}

    return app


app = create_app()
