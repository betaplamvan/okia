"""Ứng dụng FastAPI (docs/02). Server quyết định mọi kết quả; client chỉ gửi ý định."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis.asyncio as redis
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import dispose_engine, get_db
from app.i18n import Locale, resolve_locale, t


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.redis = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        yield
    finally:
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
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
