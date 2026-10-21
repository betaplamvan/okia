"""Cache nhỏ trong Redis cho đường nối WebSocket (docs/13 — Bảo mật, docs/02 — Tải).

Mỗi kết nối `/ws` cần `token_version` (để từ chối token đã thu hồi), `locale` và `display_name`.
Tra Postgres cho từng kết nối làm welcome chậm (đo 2026-10-21: 300 kết nối cùng lúc → p50 2 s,
Postgres 12 % CPU). Giữ ba trường này ở `wsu:{user_id}` TTL ngắn; mọi chỗ đổi token_version /
tên / ngôn ngữ gọi `invalidate` nên cache không bao giờ cho token đã thu hồi lọt quá vài giây
giữa hai tiến trình. Redis lỗi → tra DB như cũ (fail-open về phía DB, không phải về phía auth).
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict, dataclass

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service

log = logging.getLogger("okia.ws")

TTL_SECONDS = 300


@dataclass(frozen=True)
class WsUser:
    token_version: int
    locale: str
    display_name: str


def key(user_id: str) -> str:
    return f"wsu:{user_id}"


async def get(redis: Redis, user_id: str) -> WsUser | None:
    try:
        raw = await redis.get(key(user_id))
    except Exception:  # noqa: BLE001
        log.warning("ws_cache: Redis không đọc được, tra DB")
        return None
    if not raw:
        return None
    try:
        return WsUser(**json.loads(raw))
    except (TypeError, ValueError):
        return None


async def load(redis: Redis, db: AsyncSession, user_id: str) -> WsUser | None:
    """Cache trước, DB sau; DB có thì ghi lại cache. None = user không tồn tại / đã xóa."""
    cached = await get(redis, user_id)
    if cached is not None:
        return cached
    user = await service.get_user(db, uuid.UUID(user_id))
    if user is None:
        return None
    u = WsUser(token_version=user.token_version, locale=user.locale, display_name=user.display_name)
    try:
        await redis.set(key(user_id), json.dumps(asdict(u)), ex=TTL_SECONDS)
    except Exception:  # noqa: BLE001
        log.warning("ws_cache: Redis không ghi được")
    return u


async def invalidate(redis: Redis, *user_ids: uuid.UUID | str | None) -> None:
    ids = [key(str(u)) for u in user_ids if u is not None]
    if not ids:
        return
    try:
        await redis.delete(*ids)
    except Exception:  # noqa: BLE001
        log.warning("ws_cache: không xóa được %s", ids)
