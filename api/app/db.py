"""Engine và session SQLAlchemy async (docs/02). Session được cấp qua dependency `get_db`.

Engine gắn với event loop đang chạy (2026-10-24): kết nối asyncpg không dùng chéo loop được — test
chạy timer bằng `asyncio.run` trên loop riêng trong khi app (TestClient) ở loop khác; dùng chung
engine thì pool hỏng ("attached to a different loop") và app treo. Production một loop mỗi tiến
trình → vẫn một engine."""

import asyncio
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

_engines: dict[int | None, tuple[AsyncEngine, async_sessionmaker[AsyncSession]]] = {}


def _loop_key() -> int | None:
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        return None


def get_engine() -> AsyncEngine:
    key = _loop_key()
    got = _engines.get(key)
    if got is None:
        engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
        got = (engine, async_sessionmaker(engine, expire_on_commit=False))
        _engines[key] = got
    return got[0]


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    return _engines[_loop_key()][1]


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


async def dispose_engine() -> None:
    """Đóng engine của loop hiện tại (engine của loop khác đã đóng theo loop đó)."""
    got = _engines.pop(_loop_key(), None)
    if got is not None:
        await got[0].dispose()
    # Loop khác đã kết thúc: bỏ tham chiếu để không giữ pool chết.
    for k in [k for k in _engines if k != _loop_key()]:
        _engines.pop(k, None)
