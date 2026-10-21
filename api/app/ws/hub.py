"""Hub kết nối WebSocket + Redis pub/sub (docs/02: không cần sticky session).

Mỗi tiến trình giữ map room_id → các kết nối đang xem phòng đó; sự kiện phòng được publish lên
kênh `room:{id}` và mọi tiến trình đang psubscribe `room:*` đẩy tới kết nối của mình.
Kênh `user:{id}` gửi riêng cho một người (ghép trận: `matched`, `queue_status`).
"""

import asyncio
import contextlib
import logging
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import WebSocket
from redis.asyncio import Redis

from app.ws import messages as m

log = logging.getLogger("okia.ws")


@dataclass(eq=False)
class Connection:
    ws: WebSocket
    user_id: str
    locale: str
    rooms: set[str] = field(default_factory=set)

    async def send(self, msg: m.Msg) -> None:
        try:
            await self.ws.send_text(m.dump(msg))
        except Exception:  # noqa: BLE001 — kết nối đã đóng
            pass


class Hub:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        self.by_room: dict[str, set[Connection]] = defaultdict(set)
        self.by_user: dict[str, set[Connection]] = defaultdict(set)
        self.conns: set[Connection] = set()
        self._task: asyncio.Task[None] | None = None

    # ----- vòng đời -----

    async def start(self) -> None:
        self._task = asyncio.create_task(self._listen(), name="ws-hub-pubsub")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _listen(self) -> None:
        pubsub = self.redis.pubsub()
        await pubsub.psubscribe("room:*", "user:*")
        try:
            async for item in pubsub.listen():
                if item.get("type") != "pmessage":
                    continue
                channel = item["channel"]
                kind, target = channel.split(":", 1)
                data = item["data"]
                targets = self.by_room if kind == "room" else self.by_user
                for conn in list(targets.get(target, ())):
                    try:
                        await conn.ws.send_text(data)
                    except Exception:  # noqa: BLE001
                        pass
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("pub/sub listener dừng")
        finally:
            with contextlib.suppress(Exception):
                await pubsub.aclose()

    # ----- kết nối & phòng -----

    def add(self, conn: Connection) -> None:
        self.conns.add(conn)
        self.by_user[conn.user_id].add(conn)

    def remove(self, conn: Connection) -> None:
        self.conns.discard(conn)
        s = self.by_user.get(conn.user_id)
        if s:
            s.discard(conn)
            if not s:
                del self.by_user[conn.user_id]
        for rid in list(conn.rooms):
            self.unwatch(conn, rid)

    def watch(self, conn: Connection, room_id: str) -> None:
        conn.rooms.add(room_id)
        self.by_room[room_id].add(conn)

    def unwatch(self, conn: Connection, room_id: str) -> None:
        conn.rooms.discard(room_id)
        s = self.by_room.get(room_id)
        if s:
            s.discard(conn)
            if not s:
                del self.by_room[room_id]

    async def publish(self, room_id: str, msg: m.Msg) -> None:
        await self.redis.publish(f"room:{room_id}", m.dump(msg))

    async def publish_user(self, user_id: str, msg: m.Msg) -> None:
        await self.redis.publish(f"user:{user_id}", m.dump(msg))
