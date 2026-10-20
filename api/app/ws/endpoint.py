"""Endpoint `/ws` (docs/04): xác thực JWT qua `?token=`, `lang`, nhận tin nhắn → xử lý phòng."""

import asyncio
import contextlib
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.auth import security, service
from app.db import get_session_factory
from app.errors import AppError
from app.game import room as rooms
from app.i18n import Locale, resolve_locale, t
from app.ws import messages as m
from app.ws.hub import Connection, Hub

log = logging.getLogger("okia.ws")
router = APIRouter()

CLOSE_UNAUTHORIZED = 4401


def hub_of(ws: WebSocket) -> Hub:
    return ws.app.state.hub


def error_msg(code: str, locale: str, ref: str | None = None, **params: object) -> m.Error:
    return m.Error(code=code, message=t(f"errors.{code}", locale, **params), ref=ref)


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = "", lang: str | None = None) -> None:
    # Xác thực trước khi accept để client nhận close code rõ ràng.
    try:
        payload = security.decode_token(token, "access")
    except security.TokenError:
        await ws.close(code=CLOSE_UNAUTHORIZED, reason="UNAUTHORIZED")
        return
    user_id = payload["sub"]
    async with get_session_factory()() as db:
        user = await service.get_user(db, uuid.UUID(user_id))
    if user is None or payload.get("tv") != user.token_version:
        await ws.close(code=CLOSE_UNAUTHORIZED, reason="UNAUTHORIZED")
        return
    locale: Locale = resolve_locale(user.locale, ws.headers.get("accept-language"), lang)

    await ws.accept()
    hub = hub_of(ws)
    redis = ws.app.state.redis
    conn = Connection(ws=ws, user_id=user_id, locale=locale)
    hub.add(conn)
    name = user.display_name
    try:
        await conn.send(
            m.Welcome(
                user_id=user_id,
                active_room_id=await rooms.active_room_id(redis, user_id),
                server_time=rooms.now_ms(),
            )
        )
        while True:
            raw = await ws.receive_text()
            try:
                msg = m.client_adapter.validate_json(raw)
            except ValidationError:
                await conn.send(error_msg("BAD_MESSAGE", locale))
                continue
            try:
                await handle(hub, conn, name, msg)
            except AppError as e:
                await conn.send(error_msg(e.code, locale, ref=msg.t, **e.params))
            except Exception:  # noqa: BLE001
                log.exception("lỗi xử lý %s", msg.t)
                await conn.send(error_msg("INTERNAL", locale, ref=msg.t))
    except WebSocketDisconnect:
        pass
    finally:
        watched = list(conn.rooms)
        hub.remove(conn)
        # Server (hoặc TestClient) có thể hủy task handler ngay khi socket đóng: tách phần dọn dẹp
        # thành task riêng được shield để presence/opponent_status vẫn được cập nhật.
        cleanup = asyncio.create_task(_on_disconnect(hub, user_id, watched))
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.shield(cleanup)


async def _on_disconnect(hub: Hub, user_id: str, watched: list[str]) -> None:
    try:
        rooms_ = watched or await _rooms_of(hub.redis, user_id)
        for rid in rooms_:
            await _presence_leave(hub, rid, user_id)
    except Exception:  # noqa: BLE001
        log.exception("dọn dẹp kết nối %s", user_id)


async def _rooms_of(redis, user_id: str) -> list[str]:
    rid = await redis.get(rooms.user_key(user_id))
    return [rid] if rid else []


async def _presence_join(hub: Hub, conn: Connection, room_id: str) -> None:
    if room_id in conn.rooms:
        return
    hub.watch(conn, room_id)
    n = await rooms.presence_add(hub.redis, room_id, conn.user_id)
    if n == 1:
        await hub.publish(room_id, m.OpponentStatus(room_id=room_id, online=True))


async def _presence_leave(hub: Hub, room_id: str, user_id: str) -> None:
    n = await rooms.presence_remove(hub.redis, room_id, user_id)
    if n == 0:
        await hub.publish(room_id, m.OpponentStatus(room_id=room_id, online=False))


async def handle(hub: Hub, conn: Connection, name: str, msg: m.ClientMsg) -> None:
    redis = hub.redis
    uid = conn.user_id
    match msg:
        case m.Ping():
            await conn.send(m.Pong())

        case m.RoomCreate():
            room = await rooms.create(
                redis,
                user_id=uid,
                name=name,
                board=msg.board,
                turn_seconds=msg.turn_seconds,
                show_last_move=msg.show_last_move,
            )
            await _presence_join(hub, conn, room.id)
            await conn.send(rooms.room_state_msg(room, await rooms.online_map(redis, room.id)))

        case m.RoomJoin():
            res = await rooms.join(redis, user_id=uid, name=name, room_id=msg.room_id)
            room = res.room
            await _presence_join(hub, conn, room.id)
            online = await rooms.online_map(redis, room.id)
            if res.started:
                # Cả hai cùng nhận ảnh chụp đầy đủ khi ván bắt đầu.
                await hub.publish(room.id, rooms.room_state_msg(room, online))
            else:
                await conn.send(rooms.room_state_msg(room, online))

        case m.RoomLeave():
            room = await rooms.leave(redis, room_id=msg.room_id, user_id=uid)
            hub.unwatch(conn, msg.room_id)
            await rooms.presence_remove(redis, msg.room_id, uid)
            if room is None:
                await redis.delete(f"presence:{msg.room_id}")

        case m.Move():
            out = await rooms.play_move(
                redis, room_id=msg.room_id, user_id=uid, edge=msg.edge, seq=msg.seq
            )
            await hub.publish(out.room.id, out.moved)
            if out.over:
                await hub.publish(out.room.id, out.over)

        case m.Resign():
            room, over = await rooms.resign(redis, room_id=msg.room_id, user_id=uid)
            await hub.publish(room.id, over)

        case m.Emote():
            room = await rooms.load(redis, msg.room_id)
            seat = room.seat_of(uid) if room else None
            if seat is None:
                raise AppError("ROOM_NOT_FOUND", 404)
            await hub.publish(room.id, m.EmoteOut(room_id=room.id, by=seat, id=msg.id))  # type: ignore[arg-type]

        case m.Queue() | m.QueueCancel():
            raise AppError("UNSUPPORTED", 501)
