"""Worker quét hết giờ (docs/03 — Timer, docs/09 P1-15).

Mỗi giây, một tiến trình giữ khóa `lock:timer` lấy các phòng có deadline ≤ now trong zset
`deadlines` và tự đi cho người đang có lượt.
"""

import asyncio
import contextlib
import logging

from redis.asyncio import Redis

from app.game import room as rooms
from app.ws.hub import Hub

log = logging.getLogger("okia.timer")
LOCK_KEY = "lock:timer"


async def tick(redis: Redis, hub: Hub) -> int:
    """Xử lý mọi phòng quá hạn; trả số nước đã đi hộ. Gọi được từ test."""
    due = await redis.zrangebyscore(rooms.DEADLINES_KEY, "-inf", rooms.now_ms())
    n = 0
    for room_id in due:
        try:
            out = await rooms.timeout_move(redis, room_id)
        except Exception:  # noqa: BLE001
            log.exception("timeout phòng %s", room_id)
            continue
        if out is None:
            continue
        n += 1
        await hub.publish(out.room.id, out.moved)
        if out.over:
            await hub.publish(out.room.id, out.over)
    return n


async def run(redis: Redis, hub: Hub, interval: float = 1.0) -> None:
    while True:
        try:
            if await redis.set(LOCK_KEY, "1", nx=True, px=int(interval * 1500)):
                await tick(redis, hub)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("timer tick lỗi")
        await asyncio.sleep(interval)


class TimerWorker:
    def __init__(self, redis: Redis, hub: Hub) -> None:
        self.redis = redis
        self.hub = hub
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(run(self.redis, self.hub), name="timer-worker")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
