"""Test chạy trên database riêng `okia_test` (tạo nếu chưa có, migrate bằng Alembic) và Redis db 1.

Yêu cầu docker compose đang chạy (Postgres 5433, Redis 6380). Mỗi test bắt đầu với bảng trống.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import pytest
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://okia:okia@localhost:5433/okia_test"
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6380/1")

os.environ["ENV"] = "test"
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REDIS_URL"] = TEST_REDIS_URL
os.environ["EMAIL_PROVIDER"] = "console"
os.environ["JWT_SECRET"] = "test-secret-not-for-prod-" + "x" * 16
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-secret"

from app.auth.emails import outbox  # noqa: E402
from app.db import dispose_engine  # noqa: E402
from app.main import create_app  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TABLES = ["sessions", "auth_identities", "matches", "users"]


def _pg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def _ensure_database() -> None:
    admin = _pg_dsn(TEST_DB_URL).rsplit("/", 1)[0] + "/okia"
    name = TEST_DB_URL.rsplit("/", 1)[1]
    conn = await asyncpg.connect(admin)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
async def _migrated() -> AsyncIterator[None]:
    await _ensure_database()
    await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        check=True,
        env={**os.environ},
        capture_output=True,
    )
    yield
    await dispose_engine()


@pytest.fixture(autouse=True)
async def _clean() -> AsyncIterator[None]:
    # Mỗi test chạy trên event loop riêng (pytest-asyncio) → không dùng chung engine giữa các test:
    # dọn bảng bằng asyncpg trực tiếp và dispose engine sau mỗi test.
    conn = await asyncpg.connect(_pg_dsn(TEST_DB_URL))
    try:
        await conn.execute(f"TRUNCATE {', '.join(TABLES)} CASCADE")
    finally:
        await conn.close()
    r = aioredis.from_url(TEST_REDIS_URL)
    await r.flushdb()
    await r.aclose()
    outbox().sent.clear()
    yield
    await dispose_engine()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app = create_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
