"""Máy đi trong phòng (docs/03 — Bot chạy ở đâu; docs/07 — Ghép bot khi chờ lâu).

Sau mỗi nước của người (endpoint), sau nước hết giờ (timer) hoặc khi người vào lại phòng, gọi
`schedule(redis, hub, room)`: nếu lượt thuộc máy thì tạo task nền chờ một nhịp "suy nghĩ" rồi đi
qua `room.play_bot_move` (khóa phòng, kiểm tra lại lượt), publish `moved`/`game_over`, đi tiếp nếu
vừa ăn ô. Mỗi tiến trình chỉ giữ một task cho một phòng; hai tiến trình cùng đi hộ máy chỉ làm
máy đi nhanh hơn (khóa phòng bảo đảm hợp lệ). Máy không bao giờ "rớt mạng"; nếu tiến trình chết
giữa chừng, timer sẽ đi hộ sau khi hết giờ lượt.
"""

from __future__ import annotations

import asyncio
import logging
import random

from redis.asyncio import Redis

from app.config import get_settings
from app.game import room as rooms
from app.ws.hub import Hub

log = logging.getLogger("okia.bot")
_active: dict[str, asyncio.Task[None]] = {}


def schedule(redis: Redis, hub: Hub, room: rooms.Room) -> None:
    if room.status != "playing":
        return
    p = room.player_at(room.state.turn)
    if p is None or not p.is_bot:
        return
    cur = _active.get(room.id)
    if cur is not None and not cur.done():
        return
    task = asyncio.create_task(_run(redis, hub, room.id), name=f"bot-{room.id}")
    _active[room.id] = task
    task.add_done_callback(lambda _t: _active.pop(room.id, None))


def _delay() -> float:
    base = get_settings().bot_move_delay_ms / 1000
    return base * random.uniform(0.6, 1.4)


async def _run(redis: Redis, hub: Hub, room_id: str) -> None:
    try:
        while True:
            await asyncio.sleep(_delay())
            out = await rooms.play_bot_move(redis, room_id)
            if out is None:
                return
            await hub.publish(room_id, out.moved)
            if out.over:
                await hub.publish(room_id, out.over)
                return
            if out.room.state.turn != out.moved.by:
                return  # không ăn ô → lượt sang người
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        log.exception("máy đi lỗi ở phòng %s", room_id)


async def cancel_all() -> None:
    for t in list(_active.values()):
        t.cancel()
    _active.clear()
