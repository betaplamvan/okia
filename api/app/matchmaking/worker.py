"""Worker ghép trận (docs/07, P2-03): mỗi giây, tiến trình giữ `lock:mm` ghép các cặp trong hàng
chờ thành trận chờ chấp nhận (`match_found`), hủy trận chờ quá hạn, và gửi `queue_status` cho người
còn chờ. Phòng chỉ mở khi cả hai chấp nhận (xem `accept`)."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from redis.asyncio import Redis

from app.game import room as rooms
from app.matchmaking import pending as pd
from app.matchmaking import queue as q
from app.ws import messages as m
from app.ws.hub import Hub

log = logging.getLogger("okia.mm")
LOCK_KEY = "lock:mm"


async def tick(redis: Redis, hub: Hub) -> int:
    """Một vòng ghép; trả số cặp đã ghép. Gọi được từ test."""
    now = q.now_ms()
    n = 0
    waiting = await q.entries(redis)
    # Lưu ý: không thoát sớm khi hàng chờ trống — trận chờ quá hạn vẫn phải được hủy.
    for a, b in q.pair_up(waiting, now) if waiting else []:
        # Xóa cả hai khỏi hàng chờ trước; ai đã rời (cancel/rớt mạng) đúng lúc này thì bỏ cặp.
        ra = await q.dequeue(redis, a.user_id)
        rb = await q.dequeue(redis, b.user_id)
        if not (ra and rb):
            # Trả lại người còn ở hàng chờ (giữ thời điểm vào cũ).
            for e, removed in ((a, ra), (b, rb)):
                if removed:
                    await q.enqueue(redis, e)
            continue
        p = await pd.create(redis, a, b, now)
        for e in (a, b):
            await hub.publish_user(
                e.user_id,
                m.MatchFound(
                    match_id=p.id,
                    mode="ranked",
                    expires_at=p.expires,
                    accept_seconds=pd.ACCEPT_SECONDS,
                ),
            )
        n += 1
    # Trận chờ quá hạn: ai chưa chấp nhận coi như từ chối.
    for p in await pd.expired(redis, now):
        laggards = [u for u in p.users if not p.accepted.get(u)]
        await cancel(redis, hub, p, by=laggards or [p.a.user_id], reason="timeout")
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


async def accept(redis: Redis, hub: Hub, user_id: str) -> bool:
    """Người chơi chấp nhận; cả hai đã nhận → mở phòng và gửi `matched`.
    False nếu không có trận chờ."""
    p, both = await pd.accept(redis, user_id)
    if p is None:
        return False
    if not both:
        for u in p.users:
            await hub.publish_user(u, m.MatchUpdate(match_id=p.id, accepted=len(p.accepted)))
        return True
    await pd.remove(redis, p)
    try:
        room = await rooms.create_ranked(redis, p.a, p.b)
    except Exception:  # noqa: BLE001
        log.exception("không tạo được phòng xếp hạng cho %s – %s", p.a.user_id, p.b.user_id)
        for e in (p.a, p.b):
            await q.enqueue(redis, e)
            await hub.publish_user(
                e.user_id,
                m.MatchCancelled(match_id=p.id, reason="left", by_me=False, requeued=True),
            )
            await hub.publish_user(e.user_id, m.Queued(mode=q.MODE, board="random", since=e.since))
        return True
    await q.remember_opponents(redis, p.a.user_id, p.b.user_id)
    for u in p.users:
        await hub.publish_user(u, m.Matched(room_id=room.id, mode="ranked"))
    return True


async def cancel(
    redis: Redis, hub: Hub, p: pd.Pending, *, by: list[str], reason: pd.CancelReason
) -> None:
    """Hủy trận chờ: người trong `by` (từ chối / hết giờ / rớt mạng) rời hàng chờ; người kia được
    trả về hàng chờ với thời điểm xếp hàng cũ và nhận `queued` mới."""
    await pd.remove(redis, p)
    for u in p.users:
        culprit = u in by
        requeued = False
        if not culprit:
            e = p.entry_of(u)
            await q.enqueue(redis, e)
            requeued = True
        await hub.publish_user(
            u, m.MatchCancelled(match_id=p.id, reason=reason, by_me=culprit, requeued=requeued)
        )
        if requeued:
            await hub.publish_user(
                u, m.Queued(mode=q.MODE, board="random", since=p.entry_of(u).since)
            )


async def decline(redis: Redis, hub: Hub, user_id: str, reason: pd.CancelReason) -> bool:
    p = await pd.of_user(redis, user_id)
    if p is None:
        return False
    await cancel(redis, hub, p, by=[user_id], reason=reason)
    return True


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
