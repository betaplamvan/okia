"""Hàng chờ ghép trận trong Redis (docs/05 — Redis, docs/07 — Ghép trận).

- `mm:ranked`       zset  member = user_id, score = mmr ẩn
- `mm:ranked:info`  hash  user_id → JSON (tên, mmr, rd, hạng, thời điểm vào, locale)
- `mm:last:{uid}`   str   đối thủ xếp hạng gần nhất (1 giờ) — tránh ghép lại ngay
- `online`          zset  user_id → lần cuối thấy (ms); đếm người online 60 giây gần nhất
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import asdict, dataclass
from typing import Any

from redis.asyncio import Redis

MODE = "ranked"
QUEUE_KEY = f"mm:{MODE}"
INFO_KEY = f"mm:{MODE}:info"
ONLINE_KEY = "online"
ONLINE_WINDOW_MS = 60_000
LAST_OPP_TTL = 3600

# Cửa sổ rating ẩn (docs/07): 50 + 25 × ⌊chờ/5s⌋, trần 400; sau UNLIMITED_AFTER giây ghép bất kỳ ai
# (vắng người) — điểm cược của trận lệch sẽ giảm (app/rating/points.py).
WINDOW_BASE = 50.0
WINDOW_STEP = 25.0
WINDOW_STEP_SECONDS = 5
WINDOW_MAX = 400.0
UNLIMITED_AFTER = 90
REMATCH_GRACE = 60  # chờ > 60 giây mới chấp nhận gặp lại đối thủ vừa rồi


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class Entry:
    user_id: str
    name: str
    mmr: float
    rd: float
    since: int  # epoch ms
    locale: str = "vi"
    rank: dict[str, Any] | None = None
    avatar_url: str | None = None
    last_opponent: str | None = None
    loadout: dict[str, str] | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> Entry:
        return cls(**json.loads(raw))

    def waited_s(self, now: int | None = None) -> float:
        return max(0.0, ((now or now_ms()) - self.since) / 1000.0)

    def window(self, now: int | None = None) -> float:
        return window(self.waited_s(now))


def window(waited_s: float) -> float:
    if waited_s >= UNLIMITED_AFTER:
        return math.inf
    return min(WINDOW_MAX, WINDOW_BASE + WINDOW_STEP * math.floor(waited_s / WINDOW_STEP_SECONDS))


# ---------- Hàng chờ ----------


async def enqueue(redis: Redis, entry: Entry) -> Entry:
    """Vào hàng chờ; đã ở trong thì giữ nguyên thời điểm vào (idempotent)."""
    raw = await redis.hget(INFO_KEY, entry.user_id)
    if raw:
        return Entry.from_json(raw)
    entry.last_opponent = await redis.get(f"mm:last:{entry.user_id}")
    async with redis.pipeline(transaction=True) as pipe:
        pipe.zadd(QUEUE_KEY, {entry.user_id: entry.mmr})
        pipe.hset(INFO_KEY, entry.user_id, entry.to_json())
        await pipe.execute()
    return entry


async def dequeue(redis: Redis, user_id: str) -> bool:
    async with redis.pipeline(transaction=True) as pipe:
        pipe.zrem(QUEUE_KEY, user_id)
        pipe.hdel(INFO_KEY, user_id)
        removed, _ = await pipe.execute()
    return bool(removed)


async def in_queue(redis: Redis, user_id: str) -> bool:
    return await redis.hexists(INFO_KEY, user_id)


async def entries(redis: Redis) -> list[Entry]:
    raw = await redis.hgetall(INFO_KEY)
    return [Entry.from_json(v) for v in raw.values()]


async def size(redis: Redis) -> int:
    return int(await redis.hlen(INFO_KEY))


async def remember_opponents(redis: Redis, a: str, b: str) -> None:
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(f"mm:last:{a}", b, ex=LAST_OPP_TTL)
        pipe.set(f"mm:last:{b}", a, ex=LAST_OPP_TTL)
        await pipe.execute()


# ---------- Online ----------


async def touch_online(redis: Redis, user_id: str) -> None:
    await redis.zadd(ONLINE_KEY, {user_id: now_ms()})


async def leave_online(redis: Redis, user_id: str) -> None:
    await redis.zrem(ONLINE_KEY, user_id)


async def online_count(redis: Redis) -> int:
    now = now_ms()
    await redis.zremrangebyscore(ONLINE_KEY, "-inf", now - ONLINE_WINDOW_MS)
    return int(await redis.zcard(ONLINE_KEY))


# ---------- Thuật toán ghép ----------


def compatible(a: Entry, b: Entry, now: int) -> bool:
    """Chênh mmr nằm trong cửa sổ của CẢ HAI; không ghép lại đối thủ vừa gặp khi còn chờ ngắn."""
    gap = abs(a.mmr - b.mmr)
    if gap > a.window(now) or gap > b.window(now):
        return False
    for x, y in ((a, b), (b, a)):
        if x.last_opponent == y.user_id and x.waited_s(now) < REMATCH_GRACE:
            return False
    return True


def pair_up(waiting: list[Entry], now: int | None = None) -> list[tuple[Entry, Entry]]:
    """Duyệt người chờ lâu nhất trước; ghép với người gần mmr nhất thỏa `compatible`.
    Hàm thuần, test được."""
    now = now or now_ms()
    order = sorted(waiting, key=lambda e: e.since)
    taken: set[str] = set()
    pairs: list[tuple[Entry, Entry]] = []
    for a in order:
        if a.user_id in taken:
            continue
        best: Entry | None = None
        best_gap = math.inf
        for b in order:
            if b.user_id == a.user_id or b.user_id in taken:
                continue
            gap = abs(a.mmr - b.mmr)
            if gap < best_gap and compatible(a, b, now):
                best, best_gap = b, gap
        if best is not None:
            taken.update((a.user_id, best.user_id))
            pairs.append((a, best))
    return pairs
