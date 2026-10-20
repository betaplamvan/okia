"""Giới hạn tần suất bằng Redis INCR + EXPIRE (docs/13 — Bảo mật)."""

from redis.asyncio import Redis

from app.errors import AppError


async def hit(redis: Redis, key: str, limit: int, window_seconds: int) -> None:
    """Tăng bộ đếm `rl:{key}`; vượt `limit` trong cửa sổ → RATE_LIMITED kèm retryAfter."""
    full = f"rl:{key}"
    n = await redis.incr(full)
    if n == 1:
        await redis.expire(full, window_seconds)
    if n > limit:
        ttl = await redis.ttl(full)
        raise AppError("RATE_LIMITED", 429, retryAfter=max(1, ttl))


async def clear(redis: Redis, key: str) -> None:
    await redis.delete(f"rl:{key}")
