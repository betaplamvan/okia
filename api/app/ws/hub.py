"""Hub kết nối WebSocket + Redis pub/sub (docs/02: không cần sticky session).

Mỗi tiến trình giữ map room_id → các kết nối đang xem phòng đó; sự kiện phòng được publish lên
kênh `room:{id}` và mọi tiến trình đang psubscribe `room:*` đẩy tới kết nối của mình.
Kênh `user:{id}` gửi riêng cho một người (ghép trận: `matched`, `queue_status`).
Kênh `chat:all` phát tin chat tổng (docs/15) tới mọi kết nối đang mở khung chat (`chat_watch`).
Kênh `kick:{id}` (nội dung = mã đóng) đóng mọi kết nối của một người trên mọi tiến trình — dùng khi
tài khoản đăng nhập nơi khác (docs/13 — Một phiên mỗi tài khoản).
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
    ip: str = ""
    rooms: set[str] = field(default_factory=set)
    # Token bucket chống spam tin (docs/04 — Giới hạn): nạp `rate` tin/giây, tối đa `burst`.
    tokens: float = 0.0
    tokens_at: float = 0.0
    # Server đã đóng kết nối (kick) → vòng nhận tin dừng, không gọi receive trên socket đã đóng.
    kicked: bool = False

    def take(self, now: float, rate: float, burst: int) -> bool:
        """Lấy một token; False = đang vượt tần suất."""
        self.tokens = min(burst, self.tokens + (now - self.tokens_at) * rate)
        self.tokens_at = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True

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
        self.by_ip: dict[str, int] = defaultdict(int)
        self.conns: set[Connection] = set()
        # Kết nối đang mở khung chat tổng.
        self.chat: set[Connection] = set()
        self._task: asyncio.Task[None] | None = None

    # ----- vòng đời -----

    async def start(self) -> None:
        self._task = asyncio.create_task(self._listen(), name="ws-hub-pubsub")
        self._beat = asyncio.create_task(self._heartbeat(), name="ws-hub-heartbeat")

    async def stop(self) -> None:
        for t in (getattr(self, "_beat", None), self._task):
            if t:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await t
        with contextlib.suppress(Exception):
            await self.redis.delete(self._conns_key)

    @property
    def _conns_key(self) -> str:
        import os

        return f"ws:conns:{os.getpid()}"

    async def _heartbeat(self, interval: float = 5.0) -> None:
        """Số kết nối của tiến trình này → `ws:conns:{pid}` (TTL 3 nhịp) cho admin /stats."""
        while True:
            try:
                await self.redis.set(self._conns_key, len(self.conns), ex=int(interval * 3))
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(interval)

    async def _listen(self) -> None:
        pubsub = self.redis.pubsub()
        await pubsub.psubscribe("room:*", "user:*", "kick:*", "chat:*")
        try:
            async for item in pubsub.listen():
                if item.get("type") != "pmessage":
                    continue
                channel = item["channel"]
                kind, target = channel.split(":", 1)
                data = item["data"]
                if kind == "kick":
                    await self._close_user(target, int(data))
                    continue
                if kind == "chat":
                    receivers: list[Connection] = list(self.chat)
                else:
                    targets = self.by_room if kind == "room" else self.by_user
                    receivers = list(targets.get(target, ()))
                for conn in receivers:
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
        if conn.ip:
            self.by_ip[conn.ip] += 1

    def remove(self, conn: Connection) -> None:
        if conn not in self.conns:
            return
        self.conns.discard(conn)
        self.chat.discard(conn)
        if conn.ip:
            self.by_ip[conn.ip] -= 1
            if self.by_ip[conn.ip] <= 0:
                del self.by_ip[conn.ip]
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

    def watch_chat(self, conn: Connection) -> None:
        self.chat.add(conn)

    def unwatch_chat(self, conn: Connection) -> None:
        self.chat.discard(conn)

    async def publish(self, room_id: str, msg: m.Msg) -> None:
        await self.redis.publish(f"room:{room_id}", m.dump(msg))

    async def publish_user(self, user_id: str, msg: m.Msg) -> None:
        await self.redis.publish(f"user:{user_id}", m.dump(msg))

    async def kick_user(self, user_id: str, code: int) -> None:
        await self.redis.publish(f"kick:{user_id}", str(code))

    async def _close_user(self, user_id: str, code: int) -> None:
        for conn in list(self.by_user.get(user_id, ())):
            conn.kicked = True
            with contextlib.suppress(Exception):
                await conn.ws.close(code=code)
