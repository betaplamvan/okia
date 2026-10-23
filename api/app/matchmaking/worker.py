"""Worker ghép trận (docs/07, P2-03): mỗi giây, tiến trình giữ `lock:mm` ghép các cặp trong hàng
chờ thành trận chờ chấp nhận (`match_found`), hủy trận chờ quá hạn, và gửi `queue_status` cho người
còn chờ. Phòng chỉ mở khi cả hai chấp nhận (xem `accept`)."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from redis.asyncio import Redis

from app.config import get_settings
from app.game import bot, botplay
from app.game import room as rooms
from app.matchmaking import pending as pd
from app.matchmaking import queue as q
from app.ws import messages as m
from app.ws.hub import Hub

log = logging.getLogger("okia.mm")
LOCK_KEY = "lock:mm"


async def _offer(redis: Redis, hub: Hub, a: q.Entry, b: q.Entry, now: int) -> bool:
    """Cặp hai người thật → trận chờ chấp nhận + `match_found` cho cả hai. False nếu một người vừa
    rời hàng chờ (cancel / rớt mạng) đúng lúc này — người còn lại được trả về hàng chờ."""
    ra = await q.dequeue(redis, a.user_id)
    rb = await q.dequeue(redis, b.user_id)
    if not (ra and rb):
        # Trả lại người còn ở hàng chờ (giữ thời điểm vào cũ).
        for e, removed in ((a, ra), (b, rb)):
            if removed:
                await q.enqueue(redis, e)
        return False
    p = await pd.create(redis, a, b, now)
    for e in (a, b):
        await hub.publish_user(
            e.user_id,
            m.MatchFound(
                match_id=p.id,
                mode="ranked",
                expires_at=p.expires,
                accept_seconds=pd.accept_seconds(),
            ),
        )
    return True


def bot_after_seconds() -> int:
    """Mốc ghép máy (giây): thông số admin, không có thì biến môi trường; 0 = tắt."""
    from app.admin import config as appconfig

    cfg_after = appconfig.get("mm_bot_after_seconds")
    return cfg_after if isinstance(cfg_after, int) else get_settings().mm_bot_after_seconds


async def tick(redis: Redis, hub: Hub) -> int:
    """Một vòng ghép; trả số cặp đã ghép. Gọi được từ test.

    Thứ tự ưu tiên (docs/07): (1) cặp hợp cửa sổ mmr; (2) ai đã chờ tới mốc ghép máy mà còn người
    thật khác trong hàng → ghép người với người (bỏ qua cửa sổ / luật tránh gặp lại); (3) chỉ ai
    còn lại MỘT MÌNH mới được ghép máy."""
    now = q.now_ms()
    n = 0
    # Mục ma (không ping quá 60 s: API restart, rớt mạng) → bỏ trước khi ghép.
    for u in await q.purge_stale(redis, now):
        log.info("bỏ khỏi hàng chờ (không thấy ping): %s", u)
    waiting = await q.entries(redis)
    # Lưu ý: không thoát sớm khi hàng chờ trống — trận chờ quá hạn vẫn phải được hủy.
    for a, b in q.pair_up(waiting, now) if waiting else []:
        n += await _offer(redis, hub, a, b, now)
    bot_after = bot_after_seconds()
    if bot_after > 0:
        for a, b in q.pair_stragglers(await q.entries(redis), now, after=bot_after):
            log.info("ưu tiên người thật: %s – %s (bỏ qua cửa sổ)", a.user_id, b.user_id)
            n += await _offer(redis, hub, a, b, now)
    # Chờ quá lâu mà KHÔNG còn người thật nào khác → ghép với máy (docs/07): cũng qua vòng chấp
    # nhận như người (máy đã nhận sẵn → client thấy "đối thủ đã sẵn sàng"); nhận → mở phòng, điểm
    # hạng cược ½.
    if bot_after > 0:
        for e in await q.entries(redis):
            if e.waited_s(now) < bot_after:
                continue
            if not await q.dequeue(redis, e.user_id):
                continue
            name = rooms.BOT_NAME.get(e.locale, rooms.BOT_NAME["vi"])
            p = await pd.create(
                redis,
                e,
                pd.bot_entry(e, name, now),
                now,
                bot_strength=bot.strength_for_rating(e.mmr, e.rd),
            )
            await hub.publish_user(
                e.user_id,
                m.MatchFound(
                    match_id=p.id,
                    mode="ranked",
                    expires_at=p.expires,
                    accept_seconds=pd.accept_seconds(),
                    bot=True,
                ),
            )
            await hub.publish_user(e.user_id, m.MatchUpdate(match_id=p.id, accepted=1))
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
                    widened=e.waited_s(now) >= q.unlimited_after(),
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
    if p.is_bot:
        room = await rooms.create_vs_bot(redis, p.a, p.bot_strength or 0.65)
        await hub.publish_user(p.a.user_id, m.Matched(room_id=room.id, mode="ranked"))
        botplay.schedule(redis, hub, room)
        return True
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
        if u == pd.BOT_ID:
            continue  # máy không xếp hàng, không nhận tin
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
