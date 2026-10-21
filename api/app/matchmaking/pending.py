"""Trận chờ chấp nhận (docs/07 — Chấp nhận trận): ghép xong chưa mở phòng ngay; cả hai có
ACCEPT_SECONDS giây để bấm "Chơi luôn!". Cả hai nhận → tạo phòng xếp hạng, gửi `matched`. Một người
từ chối / hết giờ / rớt mạng → hủy: người đã chấp nhận (hoặc chưa kịp) được trả về hàng chờ với thời
điểm xếp hàng cũ, người từ chối rời hàng chờ.

Redis: `mm:pending:{id}` (JSON), zset `mm:pending` (score = hạn ms), `mm:pending:user:{uid}` → id.
"""

from __future__ import annotations

import json
import secrets
from dataclasses import asdict, dataclass, field
from typing import Literal

from redis.asyncio import Redis

from app.matchmaking import queue as q

ACCEPT_SECONDS = 20
PENDING_ZSET = "mm:pending"
CancelReason = Literal["declined", "timeout", "left"]


@dataclass
class Pending:
    id: str
    a: q.Entry
    b: q.Entry
    expires: int  # epoch ms
    accepted: dict[str, bool] = field(default_factory=dict)

    @property
    def users(self) -> tuple[str, str]:
        return (self.a.user_id, self.b.user_id)

    def entry_of(self, user_id: str) -> q.Entry:
        return self.a if self.a.user_id == user_id else self.b

    def other(self, user_id: str) -> str:
        return self.b.user_id if self.a.user_id == user_id else self.a.user_id

    def to_json(self) -> str:
        d = asdict(self)
        return json.dumps(d)

    @classmethod
    def from_json(cls, raw: str) -> Pending:
        d = json.loads(raw)
        d["a"] = q.Entry(**d["a"])
        d["b"] = q.Entry(**d["b"])
        return cls(**d)


def key(pid: str) -> str:
    return f"mm:pending:{pid}"


def user_key(user_id: str) -> str:
    return f"mm:pending:user:{user_id}"


async def create(redis: Redis, a: q.Entry, b: q.Entry, now: int | None = None) -> Pending:
    pid = secrets.token_hex(6)
    p = Pending(id=pid, a=a, b=b, expires=(now or q.now_ms()) + ACCEPT_SECONDS * 1000)
    ttl = ACCEPT_SECONDS + 30
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(key(pid), p.to_json(), ex=ttl)
        pipe.zadd(PENDING_ZSET, {pid: p.expires})
        pipe.set(user_key(a.user_id), pid, ex=ttl)
        pipe.set(user_key(b.user_id), pid, ex=ttl)
        await pipe.execute()
    return p


async def load(redis: Redis, pid: str) -> Pending | None:
    raw = await redis.get(key(pid))
    return Pending.from_json(raw) if raw else None


async def save(redis: Redis, p: Pending) -> None:
    await redis.set(key(p.id), p.to_json(), ex=ACCEPT_SECONDS + 30)


async def of_user(redis: Redis, user_id: str) -> Pending | None:
    pid = await redis.get(user_key(user_id))
    return await load(redis, pid) if pid else None


async def remove(redis: Redis, p: Pending) -> None:
    async with redis.pipeline(transaction=True) as pipe:
        pipe.delete(key(p.id))
        pipe.zrem(PENDING_ZSET, p.id)
        pipe.delete(user_key(p.a.user_id))
        pipe.delete(user_key(p.b.user_id))
        await pipe.execute()


async def expired(redis: Redis, now: int | None = None) -> list[Pending]:
    ids = await redis.zrangebyscore(PENDING_ZSET, "-inf", now or q.now_ms())
    out = []
    for pid in ids:
        p = await load(redis, pid)
        if p is None:
            await redis.zrem(PENDING_ZSET, pid)
        else:
            out.append(p)
    return out


async def accept(redis: Redis, user_id: str) -> tuple[Pending | None, bool]:
    """Đánh dấu chấp nhận. Trả (pending, cả hai đã chấp nhận?). None nếu không có trận chờ."""
    p = await of_user(redis, user_id)
    if p is None:
        return None, False
    p.accepted[user_id] = True
    await save(redis, p)
    return p, all(p.accepted.get(u) for u in p.users)
