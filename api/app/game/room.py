"""Phòng đấu trong Redis (docs/04, docs/03 — Timer). Server quyết định mọi kết quả.

Khóa: `room:{id}` (JSON), `lock:room:{id}` (SET NX PX), `user:{uid}:room`, `deadlines` (zset score =
epoch ms), `presence:{id}` (hash user_id → số kết nối). Mã phòng 6 ký tự vừa là id vừa là mã mời.
"""

import asyncio
import json
import random
import secrets
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from redis.asyncio import Redis

from app.config import get_settings
from app.db import get_session_factory
from app.errors import AppError
from app.game import maps, rules
from app.models import Match
from app.ws import messages as m

ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # bỏ I/O/0/1 cho dễ đọc
ROOM_TTL_WAITING = 2 * 3600
ROOM_TTL_PLAYING = 24 * 3600
ROOM_TTL_OVER = 10 * 60
MAX_TIMEOUTS = 3
DEADLINES_KEY = "deadlines"

Status = Literal["waiting", "playing", "over"]


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class Player:
    user_id: str
    name: str
    seat: int
    timeouts: int = 0  # số lần hết giờ liên tiếp

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class Room:
    id: str
    mode: str
    board: str  # id map đã chốt (không bao giờ là "random")
    turn_seconds: int | None
    host_id: str
    status: Status
    players: list[Player]
    state: rules.GameState
    moves: list[dict[str, Any]] = field(default_factory=list)
    deadline: int | None = None
    started_at: int | None = None
    result: dict[str, Any] | None = None
    created_at: int = field(default_factory=now_ms)
    show_last_move: bool = True

    # ----- (de)serialize -----

    def to_json(self) -> str:
        d = self.__dict__.copy()
        d["players"] = [p.to_dict() for p in self.players]
        d["state"] = state_dict(self.state)
        return json.dumps(d)

    @classmethod
    def from_json(cls, raw: str) -> "Room":
        d = json.loads(raw)
        d["players"] = [Player(**p) for p in d["players"]]
        s = d["state"]
        d["state"] = rules.GameState(
            rows=s["rows"],
            cols=s["cols"],
            edges=tuple(s["edges"]),
            owners=tuple(s["owners"]),
            scores=(s["scores"][0], s["scores"][1]),
            turn=s["turn"],
            move_no=s["moveNo"],
            finished=s["finished"],
        )
        return cls(**d)

    # ----- tiện ích -----

    def seat_of(self, user_id: str) -> int | None:
        for p in self.players:
            if p.user_id == user_id:
                return p.seat
        return None

    def player_at(self, seat: int) -> Player | None:
        return next((p for p in self.players if p.seat == seat), None)

    def next_deadline(self) -> int | None:
        return now_ms() + self.turn_seconds * 1000 if self.turn_seconds else None


def state_dict(s: rules.GameState) -> dict[str, Any]:
    return {
        "rows": s.rows,
        "cols": s.cols,
        "edges": list(s.edges),
        "owners": list(s.owners),
        "scores": list(s.scores),
        "turn": s.turn,
        "moveNo": s.move_no,
        "finished": s.finished,
    }


def state_out(s: rules.GameState) -> m.GameStateOut:
    return m.GameStateOut(**state_dict(s))


# ---------- Redis ----------


def key(room_id: str) -> str:
    return f"room:{room_id}"


def user_key(user_id: str) -> str:
    return f"user:{user_id}:room"


async def load(redis: Redis, room_id: str) -> Room | None:
    raw = await redis.get(key(room_id))
    return Room.from_json(raw) if raw else None


async def save(redis: Redis, room: Room) -> None:
    ttl = {"waiting": ROOM_TTL_WAITING, "playing": ROOM_TTL_PLAYING, "over": ROOM_TTL_OVER}[
        room.status
    ]
    await redis.set(key(room.id), room.to_json(), ex=ttl)
    if room.status == "playing" and room.deadline:
        await redis.zadd(DEADLINES_KEY, {room.id: room.deadline})
    else:
        await redis.zrem(DEADLINES_KEY, room.id)
    for p in room.players:
        if room.status == "over":
            await redis.delete(user_key(p.user_id))
        else:
            await redis.set(user_key(p.user_id), room.id, ex=ttl)


class RoomLock:
    """Khóa phòng bằng SET NX PX; chờ tối đa ~2 giây."""

    def __init__(self, redis: Redis, room_id: str, ttl_ms: int = 3000) -> None:
        self.redis = redis
        self.key = f"lock:room:{room_id}"
        self.ttl_ms = ttl_ms
        self.token = secrets.token_hex(8)

    async def __aenter__(self) -> "RoomLock":
        for _ in range(40):
            if await self.redis.set(self.key, self.token, nx=True, px=self.ttl_ms):
                return self
            await asyncio.sleep(0.05)
        raise AppError("ROOM_BUSY", 409)

    async def __aexit__(self, *exc: object) -> None:
        # Chỉ xóa nếu vẫn là khóa của mình.
        if await self.redis.get(self.key) == self.token:
            await self.redis.delete(self.key)


# ---------- Nghiệp vụ ----------


async def active_room_id(redis: Redis, user_id: str) -> str | None:
    rid = await redis.get(user_key(user_id))
    if not rid:
        return None
    room = await load(redis, rid)
    if room is None or room.status == "over":
        await redis.delete(user_key(user_id))
        return None
    return rid


def pick_map(board: str) -> maps.GameMap:
    """Chốt map: id trong bể hoặc "random". Map ẩn (3x3 cho test) chỉ dùng ngoài production."""
    m = maps.resolve(board, allow_hidden=get_settings().env != "production")
    if m is None:
        raise AppError("INVALID_BOARD", 400)
    return m


async def create(
    redis: Redis,
    *,
    user_id: str,
    name: str,
    board: str,
    turn_seconds: int | None,
    show_last_move: bool = True,
) -> Room:
    if await active_room_id(redis, user_id):
        raise AppError("ALREADY_IN_GAME", 409)
    game_map = pick_map(board)
    for _ in range(10):
        rid = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(6))
        if not await redis.exists(key(rid)):
            break
    else:  # pragma: no cover
        raise AppError("INTERNAL", 500)
    room = Room(
        id=rid,
        mode="private",
        board=game_map.id,
        turn_seconds=turn_seconds,
        host_id=user_id,
        status="waiting",
        players=[Player(user_id=user_id, name=name, seat=0)],
        state=maps.create_game(game_map),
        show_last_move=show_last_move,
    )
    await save(redis, room)
    return room


@dataclass
class JoinResult:
    room: Room
    started: bool  # vừa đủ 2 người → ván bắt đầu


async def join(redis: Redis, *, user_id: str, name: str, room_id: str) -> JoinResult:
    room_id = room_id.strip().upper()
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None:
            raise AppError("ROOM_NOT_FOUND", 404)
        if room.seat_of(user_id) is not None:
            return JoinResult(room, False)  # kết nối lại
        if room.status != "waiting" or len(room.players) >= 2:
            raise AppError("ROOM_FULL", 409)
        other = await active_room_id(redis, user_id)
        if other and other != room_id:
            raise AppError("ALREADY_IN_GAME", 409)
        # Chủ phòng đi trước hay sau: ngẫu nhiên cho công bằng.
        host = room.players[0]
        host.seat = random.randint(0, 1)
        room.players.append(Player(user_id=user_id, name=name, seat=1 - host.seat))
        room.status = "playing"
        room.started_at = now_ms()
        room.deadline = room.next_deadline()
        await save(redis, room)
        return JoinResult(room, True)


@dataclass
class MoveOutcome:
    room: Room
    moved: m.Moved
    over: m.GameOver | None


async def play_move(
    redis: Redis, *, room_id: str, user_id: str, edge: int, seq: int
) -> MoveOutcome:
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None:
            raise AppError("ROOM_NOT_FOUND", 404)
        seat = room.seat_of(user_id)
        if seat is None:
            raise AppError("ROOM_NOT_FOUND", 404)
        if room.status != "playing":
            raise AppError("GAME_OVER", 409)
        if seq != room.state.move_no:
            raise AppError("STALE_SEQ", 409)
        return await _apply(redis, room, seat, edge, "player")


async def _apply(
    redis: Redis, room: Room, seat: int, edge: int, reason: Literal["player", "timeout"]
) -> MoveOutcome:
    try:
        new_state, captured = rules.apply_move(room.state, seat, edge)
    except rules.MoveError as e:
        raise AppError(e.code, 409) from e
    room.state = new_state
    room.moves.append({"by": seat, "edge": edge, "t": now_ms(), "reason": reason})
    player = room.player_at(seat)
    if player:
        player.timeouts = player.timeouts + 1 if reason == "timeout" else 0
    over: m.GameOver | None = None
    if new_state.finished:
        over = await _finish(room, rules.winner(new_state), "complete")
    elif player and player.timeouts >= MAX_TIMEOUTS:
        over = await _finish(room, 1 - seat, "afk")
    else:
        room.deadline = room.next_deadline()
    await save(redis, room)
    moved = m.Moved(
        room_id=room.id,
        by=seat,  # type: ignore[arg-type]
        edge=edge,
        captured=captured,
        scores=list(new_state.scores),
        turn=new_state.turn,
        move_no=new_state.move_no,
        deadline=room.deadline,
        reason=reason,
    )
    return MoveOutcome(room, moved, over)


async def resign(redis: Redis, *, room_id: str, user_id: str) -> tuple[Room, m.GameOver]:
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.seat_of(user_id) is None:
            raise AppError("ROOM_NOT_FOUND", 404)
        if room.status != "playing":
            raise AppError("GAME_OVER", 409)
        seat = room.seat_of(user_id)
        assert seat is not None
        over = await _finish(room, 1 - seat, "resign")
        await save(redis, room)
        return room, over


async def leave(redis: Redis, *, room_id: str, user_id: str) -> Room | None:
    """Rời phòng đang chờ (xóa phòng) hoặc đã xong (bỏ liên kết user→room)."""
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.seat_of(user_id) is None:
            return None
        if room.status == "waiting":
            await redis.delete(key(room_id))
            await redis.delete(user_key(user_id))
            return None
        if room.status == "over":
            await redis.delete(user_key(user_id))
        return room


async def timeout_move(redis: Redis, room_id: str) -> MoveOutcome | None:
    """Hết giờ: đi ngẫu nhiên một cạnh hợp lệ cho người đang có lượt (docs/03)."""
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.status != "playing" or not room.deadline:
            await redis.zrem(DEADLINES_KEY, room_id)
            return None
        if room.deadline > now_ms():
            await redis.zadd(DEADLINES_KEY, {room.id: room.deadline})
            return None
        legal = rules.legal_moves(room.state)
        if not legal:  # pragma: no cover
            return None
        edge = random.choice(legal)
        return await _apply(redis, room, room.state.turn, edge, "timeout")


async def _finish(
    room: Room, winner: int | None, reason: Literal["complete", "resign", "afk", "abandon"]
) -> m.GameOver:
    room.status = "over"
    room.deadline = None
    over = m.GameOver(
        room_id=room.id,
        winner=winner,  # type: ignore[arg-type]
        scores=list(room.state.scores),
        reason=reason,
    )
    room.result = over.model_dump(by_alias=True)
    await _record_match(room, over)
    return over


async def _record_match(room: Room, over: m.GameOver) -> None:
    """Ghi bảng `matches` (docs/05). Lỗi DB không làm hỏng ván: ghi log, trận vẫn kết thúc."""
    try:
        p0 = room.player_at(0)
        p1 = room.player_at(1)
        async with get_session_factory()() as db:
            db.add(
                Match(
                    id=uuid.uuid4(),
                    mode=room.mode,
                    board=room.board,
                    player0=uuid.UUID(p0.user_id) if p0 else None,
                    player1=uuid.UUID(p1.user_id) if p1 else None,
                    moves=room.moves,
                    scores=list(room.state.scores),
                    winner=over.winner,
                    end_reason=over.reason,
                    started_at=datetime.fromtimestamp((room.started_at or now_ms()) / 1000, UTC),
                    ended_at=datetime.now(UTC),
                )
            )
            await db.commit()
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger("okia.room").exception("không ghi được trận %s", room.id)


# ---------- Presence ----------


async def presence_add(redis: Redis, room_id: str, user_id: str) -> int:
    n = await redis.hincrby(f"presence:{room_id}", user_id, 1)
    await redis.expire(f"presence:{room_id}", ROOM_TTL_PLAYING)
    return int(n)


async def presence_remove(redis: Redis, room_id: str, user_id: str) -> int:
    n = await redis.hincrby(f"presence:{room_id}", user_id, -1)
    if n <= 0:
        await redis.hdel(f"presence:{room_id}", user_id)
        return 0
    return int(n)


async def online_map(redis: Redis, room_id: str) -> dict[str, bool]:
    h = await redis.hgetall(f"presence:{room_id}")
    return {k: int(v) > 0 for k, v in h.items()}


def room_state_msg(room: Room, online: dict[str, bool]) -> m.RoomState:
    return m.RoomState(
        room_id=room.id,
        mode=room.mode,  # type: ignore[arg-type]
        board=room.board,  # type: ignore[arg-type]
        turn_seconds=room.turn_seconds,  # type: ignore[arg-type]
        show_last_move=room.show_last_move,
        status=room.status,
        host_id=room.host_id,
        players=[
            m.PlayerOut(
                user_id=p.user_id,
                name=p.name,
                seat=p.seat,  # type: ignore[arg-type]
                online=online.get(p.user_id, False),
            )
            for p in sorted(room.players, key=lambda p: p.seat)
        ],
        state=state_out(room.state),
        deadline=room.deadline,
        result=m.GameOver(**room.result) if room.result else None,
    )
