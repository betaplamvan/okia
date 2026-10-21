"""Endpoint `/ws` (docs/04): xác thực JWT qua `?token=`, `lang`, nhận tin nhắn → xử lý phòng."""

import asyncio
import contextlib
import logging
import time
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.auth import security, service, ws_cache
from app.auth.deps import is_loopback, real_ip
from app.config import get_settings
from app.db import get_session_factory
from app.errors import AppError
from app.game import room as rooms
from app.i18n import Locale, resolve_locale, t
from app.matchmaking import queue as mmq
from app.matchmaking import worker as mmw
from app.ws import messages as m
from app.ws.hub import Connection, Hub

log = logging.getLogger("okia.ws")
router = APIRouter()

CLOSE_UNAUTHORIZED = 4401
# Quá số kết nối cho phép (mỗi tài khoản / mỗi IP) — client không nên tự nối lại ngay.
CLOSE_TOO_MANY = 4429
# Gửi tin quá dày hoặc quá lớn — client bị ngắt, nối lại theo backoff.
CLOSE_FLOOD = 4430
# Tài khoản vừa đăng nhập nơi khác (docs/13) — client refresh; phiên đã bị thay thì báo người dùng.
CLOSE_SESSION_REPLACED = 4409


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
    redis = ws.app.state.redis
    # token_version / locale / tên lấy từ cache Redis (ws_cache), DB chỉ khi cache trống.
    async with get_session_factory()() as db:
        user = await ws_cache.load(redis, db, user_id)
    if user is None or payload.get("tv") != user.token_version:
        await ws.close(code=CLOSE_UNAUTHORIZED, reason="UNAUTHORIZED")
        return
    locale: Locale = resolve_locale(user.locale, ws.headers.get("accept-language"), lang)

    # Giới hạn số kết nối (docs/04 — Giới hạn), đếm trên tiến trình này. Loopback (script đo tải
    # chạy trên máy; cổng API chỉ bind 127.0.0.1) được miễn.
    hub = hub_of(ws)
    cfg = get_settings()
    ip = real_ip(ws.headers, ws.client.host if ws.client else "")
    if not is_loopback(ip) and (
        len(hub.by_user.get(user_id, ())) >= cfg.ws_max_conn_per_user
        or hub.by_ip.get(ip, 0) >= cfg.ws_max_conn_per_ip
    ):
        await ws.close(code=CLOSE_TOO_MANY, reason="TOO_MANY_CONNECTIONS")
        return

    await ws.accept()
    conn = Connection(
        ws=ws,
        user_id=user_id,
        locale=locale,
        ip=ip,
        tokens=cfg.ws_msg_burst,
        tokens_at=time.monotonic(),
    )
    hub.add(conn)
    name = user.display_name
    await mmq.touch_online(redis, user_id)
    try:
        await conn.send(
            m.Welcome(
                user_id=user_id,
                active_room_id=await rooms.active_room_id(redis, user_id),
                server_time=rooms.now_ms(),
            )
        )
        while not conn.kicked:
            raw = await ws.receive_text()
            # Tin quá lớn hoặc quá dày → ngắt kết nối (không xử lý, không trả lời từng tin).
            if len(raw) > cfg.ws_max_msg_bytes or not conn.take(
                time.monotonic(), cfg.ws_msg_per_second, cfg.ws_msg_burst
            ):
                log.warning("ws flood: user=%s ip=%s", user_id, ip)
                await ws.close(code=CLOSE_FLOOD, reason="FLOOD")
                break
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
        # Tab cuối của người này đóng → rời hàng chờ (client sẽ tự vào lại khi nối lại) và offline.
        if user_id not in hub.by_user:
            await mmq.dequeue(hub.redis, user_id)
            await mmw.decline(hub.redis, hub, user_id, "left")
            await mmq.leave_online(hub.redis, user_id)
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
            await mmq.touch_online(redis, uid)
            await conn.send(m.Pong())

        case m.RoomCreate():
            room = await rooms.create(
                redis,
                user_id=uid,
                name=name,
                board=msg.board,
                turn_seconds=msg.turn_seconds,
                show_last_move=msg.show_last_move,
                loadout=await _loadout(uid),
            )
            await _presence_join(hub, conn, room.id)
            await conn.send(rooms.room_state_msg(room, await rooms.online_map(redis, room.id)))

        case m.RoomJoin():
            res = await rooms.join(
                redis, user_id=uid, name=name, room_id=msg.room_id, loadout=await _loadout(uid)
            )
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

        case m.Queue():
            if msg.mode != "ranked":
                raise AppError("UNSUPPORTED", 501)  # casual: giai đoạn sau (P2-06)
            entry = await _ranked_entry(redis, uid)
            await conn.send(m.Queued(mode="ranked", board="random", since=entry.since))

        case m.QueueCancel():
            await mmq.dequeue(redis, uid)
            # Đang trong trận chờ chấp nhận mà hủy tìm → coi như từ chối.
            await mmw.decline(redis, hub, uid, "declined")

        case m.MatchAccept():
            if not await mmw.accept(redis, hub, uid):
                raise AppError("MATCH_EXPIRED", 409)

        case m.MatchDecline():
            if not await mmw.decline(redis, hub, uid, "declined"):
                raise AppError("MATCH_EXPIRED", 409)


async def _loadout(user_id: str) -> dict[str, str]:
    """Skin đang trang bị, gửi trong room_state.loadouts để đối thủ thấy bút/ô của mình."""
    from app.skins import service as skins

    async with get_session_factory()() as db:
        return await skins.loadout_of(db, uuid.UUID(user_id))


async def _ranked_entry(redis, user_id: str) -> mmq.Entry:
    """Vào hàng chờ xếp hạng (docs/07): cần tài khoản thật đã xác minh, không đang dở trận.
    Đọc lại user từ DB vì khách có thể vừa nâng cấp Google trong phiên WS này."""
    from app.economy.router import avatar_url_for
    from app.rating import service as rating
    from app.skins import service as skins

    if await rooms.active_room_id(redis, user_id):
        raise AppError("ALREADY_IN_GAME", 409)
    from app.matchmaking import pending as mmp

    if await mmp.of_user(redis, user_id):
        raise AppError("MATCH_PENDING", 409)
    async with get_session_factory()() as db:
        user = await service.get_user(db, uuid.UUID(user_id))
        if user is None:
            raise AppError("UNAUTHORIZED", 401)
        if user.is_guest:
            raise AppError("GUEST_NOT_ALLOWED", 403)
        if user.email_verified_at is None:
            raise AppError("EMAIL_NOT_VERIFIED", 403)
        season = await rating.current_season(db)
        r = await rating.get_or_create_rating(db, user.id, season)
        await db.commit()
        rank = await rating.titled_rank(db, r)
        entry = mmq.Entry(
            user_id=user_id,
            name=user.display_name,
            mmr=r.mmr,
            rd=r.rd,
            since=mmq.now_ms(),
            locale=user.locale,
            rank=rank.to_dict() if rank else None,
            avatar_url=avatar_url_for(user),
            loadout=await skins.loadout_of(db, user.id),
        )
    return await mmq.enqueue(redis, entry)
