"""Trận chờ chấp nhận (docs/07 — Chấp nhận trận): ghép xong chưa mở phòng ngay; cả hai có
ACCEPT_SECONDS giây để bấm "Chơi luôn!". Cả hai nhận → tạo phòng xếp hạng, gửi `matched`. Một người
từ chối / hết giờ / rớt mạng → hủy: người đã chấp nhận (hoặc chưa kịp) được trả về hàng chờ với thời
điểm xếp hàng cũ, người từ chối rời hàng chờ.

Redis: `mm:pending:{id}` (JSON), zset `mm:pending` (score = hạn ms), `mm:pending:user:{uid}` → id,
set `mm:pending:{id}:acc` = người đã chấp nhận. Chấp nhận ghi bằng SADD (nguyên tử): trước
2026-10-23 là đọc–sửa–ghi cả JSON → hai người bấm cùng lúc thì lượt ghi sau xóa mất lượt nhận của
người kia, phòng không bao giờ mở và trận bị hủy "hết giờ".

Ghép máy (2026-10-22) cũng đi qua vòng này: `b` là Entry giả của máy (user_id = BOT_ID), đã chấp
nhận sẵn, `bot_strength` ghi độ mạnh; người chấp nhận → mở phòng vs máy, từ chối / hết giờ → rời
hàng chờ như trận thường (máy không bao giờ được xếp hàng).
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
BOT_ID = "bot"  # = app.game.room.BOT_ID (tránh import vòng)
CancelReason = Literal["declined", "timeout", "left"]


@dataclass
class Pending:
    id: str
    a: q.Entry
    b: q.Entry
    expires: int  # epoch ms
    accepted: dict[str, bool] = field(default_factory=dict)
    # Trận với máy: độ mạnh 0–1 (None = hai người thật).
    bot_strength: float | None = None

    @property
    def is_bot(self) -> bool:
        return self.bot_strength is not None

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


def acc_key(pid: str) -> str:
    return f"mm:pending:{pid}:acc"


def _s(v: bytes | str) -> str:
    return v.decode() if isinstance(v, bytes) else v


async def create(
    redis: Redis,
    a: q.Entry,
    b: q.Entry,
    now: int | None = None,
    *,
    bot_strength: float | None = None,
) -> Pending:
    pid = secrets.token_hex(6)
    p = Pending(
        id=pid,
        a=a,
        b=b,
        expires=(now or q.now_ms()) + ACCEPT_SECONDS * 1000,
        bot_strength=bot_strength,
    )
    if bot_strength is not None:
        p.accepted[b.user_id] = True  # máy luôn sẵn sàng
    ttl = ACCEPT_SECONDS + 30
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(key(pid), p.to_json(), ex=ttl)
        pipe.zadd(PENDING_ZSET, {pid: p.expires})
        pipe.set(user_key(a.user_id), pid, ex=ttl)
        if b.user_id != BOT_ID:
            pipe.set(user_key(b.user_id), pid, ex=ttl)
        await pipe.execute()
    return p


def bot_entry(a: q.Entry, name: str, now: int | None = None) -> q.Entry:
    """Entry giả của máy để đặt vào trận chờ (rating = của người, chỉ để hiển thị)."""
    return q.Entry(BOT_ID, name, a.mmr, a.rd, now or q.now_ms(), locale=a.locale)


async def load(redis: Redis, pid: str) -> Pending | None:
    raw = await redis.get(key(pid))
    if not raw:
        return None
    p = Pending.from_json(raw)
    for u in await redis.smembers(acc_key(pid)):
        p.accepted[_s(u)] = True
    return p


async def save(redis: Redis, p: Pending) -> None:
    """Ghi lại JSON (hạn, …). Không dùng để ghi chấp nhận — xem `accept`."""
    await redis.set(key(p.id), p.to_json(), ex=ACCEPT_SECONDS + 30)


async def of_user(redis: Redis, user_id: str) -> Pending | None:
    pid = await redis.get(user_key(user_id))
    return await load(redis, pid) if pid else None


async def remove(redis: Redis, p: Pending) -> None:
    async with redis.pipeline(transaction=True) as pipe:
        pipe.delete(key(p.id))
        pipe.delete(acc_key(p.id))
        pipe.zrem(PENDING_ZSET, p.id)
        pipe.delete(user_key(p.a.user_id))
        if p.b.user_id != BOT_ID:
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
    """Đánh dấu chấp nhận (SADD — nguyên tử). Trả (pending, đủ người để mở phòng?). None nếu không
    có trận chờ. "Đủ" chỉ trả True cho ĐÚNG lượt chấp nhận cuối cùng (lượt vừa thêm người còn
    thiếu): bấm lặp hoặc hai lượt cùng lúc không mở hai phòng."""
    p = await of_user(redis, user_id)
    if p is None:
        return None, False
    async with redis.pipeline(transaction=True) as pipe:
        pipe.sadd(acc_key(p.id), user_id)
        pipe.expire(acc_key(p.id), ACCEPT_SECONDS + 30)
        pipe.smembers(acc_key(p.id))
        added, _, members = await pipe.execute()
    for u in members:
        p.accepted[_s(u)] = True
    both = bool(added) and all(p.accepted.get(u) for u in p.users)
    return p, both
