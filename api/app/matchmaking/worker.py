"""Worker ghép trận (docs/07, P2-03): mỗi giây, tiến trình giữ `lock:mm` ghép các cặp trong hàng
chờ, tạo phòng xếp hạng, gửi `matched` cho hai người; người còn chờ nhận `queue_status`."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from redis.asyncio import Redis

from app.game import room as rooms
from app.matchmaking import queue as q
from app.ws import messages as m
from app.ws.hub import Hub

log = logging.getLogger("okia.mm")
LOCK_KEY = "lock:mm"


async def tick(redis: Redis, hub: Hub) -> int:
    """Một vòng ghép; trả số cặp đã ghép. Gọi được từ test."""
    waiting = await q.entries(redis)
    if not waiting:
        return 0
    now = q.now_ms()
    n = 0
    for a, b in q.pair_up(waiting, now):
        # Xóa cả hai khỏi hàng chờ trước; ai đã rời (cancel/rớt mạng) đúng lúc này thì bỏ cặp.
        ra = await q.dequeue(redis, a.user_id)
        rb = await q.dequeue(redis, b.user_id)
        if not (ra and rb):
            # Trả lại người còn ở hàng chờ (giữ thời điểm vào cũ).
            for e, removed in ((a, ra), (b, rb)):
                if removed:
                    await q.enqueue(redis, e)
            continue
        try:
            room = await rooms.create_ranked(redis, a, b)
        except Exception:  # noqa: BLE001
            log.exception("không tạo được phòng xếp hạng cho %s – %s", a.user_id, b.user_id)
            await q.enqueue(redis, a)
            await q.enqueue(redis, b)
            continue
        await q.remember_opponents(redis, a.user_id, b.user_id)
        for e in (a, b):
            await hub.publish_user(e.user_id, m.Matched(room_id=room.id, mode="ranked"))
        n += 1
    # Cập nhật cho người còn chờ.
    left = await q.entries(redis)
    if left:
        online = await q.online_count(redis)
        for e in left:
            await hub.publish_user(
                e.user_id,
                m.QueueStatus(
                    mode=q.MODE,
                    waiting=len(left),
                    online=online,
                    since=e.since,
                    widened=e.waited_s(now) >= q.UNLIMITED_AFTER,
                ),
            )
    return n


async def run(redis: Redis, hub: Hub, interval: float = 1.0) -> None:
    while True:
        try:
            if await redis.set(LOCK_KEY, "1", nx=True, px=int(interval * 1500)):
                await tick(redis, hub)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("mm tick lỗi")
        await asyncio.sleep(interval)


class MatchmakingWorker:
    def __init__(self, redis: Redis, hub: Hub) -> None:
        self.redis = redis
        self.hub = hub
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(run(self.redis, self.hub), name="mm-worker")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
