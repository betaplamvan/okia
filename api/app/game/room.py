"""Phòng đấu trong Redis (docs/04, docs/03 — Timer). Server quyết định mọi kết quả.

Khóa: `room:{id}` (JSON), `lock:room:{id}` (SET NX PX), `user:{uid}:room`, `deadlines` (zset score =
epoch ms), `presence:{id}` (zset "user|conn" → lần cuối thấy ms; kết nối không ping quá
PRESENCE_STALE_MS coi như rớt — tự sạch sau khi API restart, docs/04 — Kết nối lại). Mã phòng 6 ký
tự vừa là id vừa là mã mời.
"""

import asyncio
import json
import random
import secrets
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from redis.asyncio import Redis

from app.config import get_settings
from app.db import get_session_factory
from app.errors import AppError
from app.game import maps, rules
from app.models import Match
from app.ws import messages as m

if TYPE_CHECKING:
    from app.matchmaking.queue import Entry

ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # bỏ I/O/0/1 cho dễ đọc
ROOM_TTL_WAITING = 2 * 3600
ROOM_TTL_PLAYING = 24 * 3600
ROOM_TTL_OVER = 10 * 60
# Tập phòng đang chơi (admin /stats đếm nhanh, không scan key).
PLAYING_KEY = "rooms:playing"
MAX_TIMEOUTS = 3
RANKED_TURN_SECONDS = 30
# Kết nối không ping quá chừng này (client ping 20 s) → coi như rớt.
PRESENCE_STALE_MS = 60_000
# Người rớt mạng có chừng này giây (từ lúc tới lượt / từ lúc rớt với phòng không giới hạn giờ) để
# nối lại; hết → xử thua "abandon". Thông số admin `disconnect_grace_seconds`.
DISCONNECT_GRACE_SECONDS = 60


def disconnect_grace_ms() -> int:
    from app.admin import config as appconfig

    return appconfig.get_int("disconnect_grace_seconds", DISCONNECT_GRACE_SECONDS) * 1000


def ranked_turn_seconds() -> int:
    """Thông số admin `ranked_turn_seconds` (mặc định RANKED_TURN_SECONDS)."""
    from app.admin import config as appconfig

    return appconfig.get_int("ranked_turn_seconds", RANKED_TURN_SECONDS)


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
    is_bot: bool = False  # máy (docs/03): user_id = BOT_ID, không có tài khoản
    avatar_url: str | None = None
    rank: dict[str, Any] | None = None  # hạng hiển thị lúc vào trận (chỉ phòng xếp hạng)
    loadout: dict[str, str] | None = None  # skin bút / ô đang trang bị (ADR-0013)

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
    # Phòng có máy (docs/07 — ghép bot khi chờ lâu): độ mạnh bot; None = không có máy.
    bot_strength: float | None = None
    # Ân hạn rớt mạng (docs/04 — Kết nối lại): ghế đang rớt và hạn nối lại (epoch ms); hết hạn mà
    # vẫn rớt → thua "abandon". Trong lúc ân hạn đồng hồ lượt của người đó dừng.
    grace_seat: int | None = None
    grace_until: int | None = None

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
    if room.status == "playing":
        await redis.sadd(PLAYING_KEY, room.id)
    else:
        await redis.srem(PLAYING_KEY, room.id)
    for p in room.players:
        if p.is_bot:
            continue
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
    loadout: dict[str, str] | None = None,
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
        players=[Player(user_id=user_id, name=name, seat=0, loadout=loadout)],
        state=maps.create_game(game_map),
        show_last_move=show_last_move,
    )
    await save(redis, room)
    return room


@dataclass
class JoinResult:
    room: Room
    started: bool  # vừa đủ 2 người → ván bắt đầu


async def join(
    redis: Redis,
    *,
    user_id: str,
    name: str,
    room_id: str,
    loadout: dict[str, str] | None = None,
) -> JoinResult:
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
        room.players.append(Player(user_id=user_id, name=name, seat=1 - host.seat, loadout=loadout))
        room.status = "playing"
        room.started_at = now_ms()
        room.deadline = room.next_deadline()
        await save(redis, room)
        return JoinResult(room, True)


async def create_ranked(redis: Redis, a: "Entry", b: "Entry") -> Room:
    """Phòng xếp hạng do worker ghép trận tạo (docs/07): map ngẫu nhiên, 30 giây/lượt, bắt đầu
    ngay (không có trạng thái chờ)."""
    game_map = pick_map(maps.RANDOM_MAP)
    for _ in range(10):
        rid = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(6))
        if not await redis.exists(key(rid)):
            break
    else:  # pragma: no cover
        raise AppError("INTERNAL", 500)
    seat_a = random.randint(0, 1)
    room = Room(
        id=rid,
        mode="ranked",
        board=game_map.id,
        turn_seconds=ranked_turn_seconds(),
        host_id=a.user_id,
        status="playing",
        players=[
            Player(
                a.user_id, a.name, seat_a, avatar_url=a.avatar_url, rank=a.rank, loadout=a.loadout
            ),
            Player(
                b.user_id,
                b.name,
                1 - seat_a,
                avatar_url=b.avatar_url,
                rank=b.rank,
                loadout=b.loadout,
            ),
        ],
        state=maps.create_game(game_map),
        started_at=now_ms(),
    )
    room.deadline = room.next_deadline()
    await save(redis, room)
    return room


BOT_ID = "bot"
BOT_NAME = {"vi": "Máy", "en": "Bot"}


async def create_vs_bot(redis: Redis, a: "Entry", strength: float) -> Room:
    """Phòng xếp hạng người vs máy (docs/07): chờ quá lâu thì worker ghép bot; luật như trận xếp
    hạng thường, điểm hạng cược một nửa, rating ẩn giữ nguyên (`rating.settle_vs_bot`)."""
    from app.skins import catalog

    game_map = pick_map(maps.RANDOM_MAP)
    for _ in range(10):
        rid = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(6))
        if not await redis.exists(key(rid)):
            break
    else:  # pragma: no cover
        raise AppError("INTERNAL", 500)
    seat_a = random.randint(0, 1)
    room = Room(
        id=rid,
        mode="ranked",
        board=game_map.id,
        turn_seconds=ranked_turn_seconds(),
        host_id=a.user_id,
        status="playing",
        players=[
            Player(
                a.user_id, a.name, seat_a, avatar_url=a.avatar_url, rank=a.rank, loadout=a.loadout
            ),
            Player(
                BOT_ID,
                BOT_NAME.get(a.locale, BOT_NAME["vi"]),
                1 - seat_a,
                is_bot=True,
                loadout=catalog.default_loadout(),
            ),
        ],
        state=maps.create_game(game_map),
        started_at=now_ms(),
        bot_strength=strength,
    )
    room.deadline = room.next_deadline()
    await save(redis, room)
    return room


@dataclass
class MoveOutcome:
    room: Room
    # None khi không có nước đi (timer bắt đầu ân hạn / xử thua abandon / trả lượt mới).
    moved: m.Moved | None
    over: m.GameOver | None
    # Timer vừa bắt đầu ân hạn cho ghế rớt (gửi opponent_status kèm graceUntil).
    grace_started: bool = False
    # Người rớt đã trở lại → lượt mới (gửi room_state cho cả phòng).
    resumed: bool = False


async def play_bot_move(redis: Redis, room_id: str) -> MoveOutcome | None:
    """Máy đi một nước nếu đang tới lượt máy (botplay). None = không phải lượt máy / phòng xong."""
    from app.game import bot

    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.status != "playing":
            return None
        p = room.player_at(room.state.turn)
        if p is None or not p.is_bot:
            return None
        edge = bot.choose_move(room.state, strength=room.bot_strength or 0.8)
        return await _apply(redis, room, room.state.turn, edge, "player")


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
    """Hết giờ (docs/03): đi ngẫu nhiên một cạnh hợp lệ cho người đang có lượt. Người đó đang rớt
    mạng (docs/04 — Kết nối lại) → KHÔNG đi hộ: bắt đầu ân hạn `disconnect_grace_seconds` (đồng hồ
    dừng, đối thủ thấy đếm ngược); hết ân hạn mà vẫn rớt → thua "abandon"; trở lại → lượt mới.
    Phòng không giới hạn giờ chỉ có deadline khi có người rớt (note_offline)."""
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.status != "playing" or not room.deadline:
            await redis.zrem(DEADLINES_KEY, room_id)
            return None
        now = now_ms()
        if room.deadline > now:
            await redis.zadd(DEADLINES_KEY, {room.id: room.deadline})
            return None
        online = await online_map(redis, room.id)

        def offline(seat: int | None) -> Player | None:
            p = room.player_at(seat) if seat is not None else None
            return p if p and not p.is_bot and not online.get(p.user_id) else None

        if room.turn_seconds is None:
            # Deadline chỉ tồn tại vì có người rớt: hết ân hạn → abandon, đã quay lại → bỏ hạn.
            gone = offline(room.grace_seat)
            if gone is not None and room.grace_until and now >= room.grace_until:
                over = await _finish(room, 1 - gone.seat, "abandon")
                await save(redis, room)
                return MoveOutcome(room, None, over)
            room.grace_seat = room.grace_until = room.deadline = None
            await save(redis, room)
            return None

        seat = room.state.turn
        gone = offline(seat)
        if gone is not None:
            if room.grace_seat == seat and room.grace_until and now >= room.grace_until:
                over = await _finish(room, 1 - seat, "abandon")
                await save(redis, room)
                return MoveOutcome(room, None, over)
            if room.grace_seat != seat or not room.grace_until:
                room.grace_seat = seat
                room.grace_until = now + disconnect_grace_ms()
                room.deadline = room.grace_until
                await save(redis, room)
                return MoveOutcome(room, None, None, grace_started=True)
            await redis.zadd(DEADLINES_KEY, {room.id: room.grace_until})
            return None
        if room.grace_seat is not None:
            # Người rớt đã trở lại (nối lại không qua presence) → lượt mới, xoá bỏ lượt đã đếm.
            p = room.player_at(room.grace_seat)
            if p:
                p.timeouts = 0
            room.grace_seat = room.grace_until = None
            room.deadline = room.next_deadline()
            await save(redis, room)
            return MoveOutcome(room, None, None, resumed=True)
        legal = rules.legal_moves(room.state)
        if not legal:  # pragma: no cover
            return None
        edge = random.choice(legal)
        return await _apply(redis, room, room.state.turn, edge, "timeout")


async def note_offline(redis: Redis, room_id: str, user_id: str) -> int | None:
    """Người này vừa mất kết nối cuối cùng. Phòng không giới hạn giờ đang chơi → đặt hạn nối lại
    (deadline = now + ân hạn) để timer xử thua abandon nếu không quay lại. Trả `grace_until`."""
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.status != "playing" or room.turn_seconds is not None:
            return None
        seat = room.seat_of(user_id)
        if seat is None or room.grace_seat is not None:
            return room.grace_until if room is not None and room.grace_seat == seat else None
        room.grace_seat = seat
        room.grace_until = now_ms() + disconnect_grace_ms()
        room.deadline = room.grace_until
        await save(redis, room)
        return room.grace_until


async def resume_after_reconnect(redis: Redis, room_id: str, user_id: str) -> Room | None:
    """Người đang trong ân hạn nối lại → bỏ ân hạn, lượt mới trọn vẹn (phòng có giờ) và xoá số lần
    bỏ lượt đã đếm. Trả phòng nếu có thay đổi (gửi room_state cho cả phòng)."""
    async with RoomLock(redis, room_id):
        room = await load(redis, room_id)
        if room is None or room.status != "playing":
            return None
        seat = room.seat_of(user_id)
        if seat is None or room.grace_seat != seat:
            return None
        p = room.player_at(seat)
        if p:
            p.timeouts = 0
        room.grace_seat = room.grace_until = None
        room.deadline = room.next_deadline()
        await save(redis, room)
        return room


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
    if room.mode == "ranked":
        over.ranked = await _settle_ranked(room, over)
    else:
        await _record_match(room, over)
    room.result = over.model_dump(by_alias=True)
    await _record_progress(room, over)
    return over


def _max_combo(room: Room, seat: int) -> int:
    """Combo lớn nhất của một ghế: số nước liên tiếp có ăn ô (tính lại từ moves + luật)."""
    best = run = 0
    state = maps.create_game(maps.resolve(room.board, allow_hidden=True))  # type: ignore[arg-type]
    for mv in room.moves:
        state, captured = rules.apply_move(state, mv["by"], mv["edge"])
        if mv["by"] == seat and captured:
            run += len(captured)
            best = max(best, run)
        elif mv["by"] == seat:
            run = 0
    return best


async def _record_progress(room: Room, over: m.GameOver) -> None:
    """Nuôi nhiệm vụ cho hai người chơi (ADR-0010). Ván afk hoặc đầu hàng sớm (< 10 nước): bỏ."""
    if over.reason == "afk" or (over.reason != "complete" and len(room.moves) < 10):
        return
    from app.economy import quests

    try:
        async with get_session_factory()() as db:
            for p in room.players:
                if p.is_bot:
                    continue
                await quests.record_game(
                    db,
                    uuid.UUID(p.user_id),
                    won=over.winner == p.seat,
                    online=True,
                    max_combo=_max_combo(room, p.seat),
                )
            await db.commit()
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger("okia.room").exception("không ghi được tiến trình %s", room.id)


async def _settle_ranked(room: Room, over: m.GameOver) -> m.RankedResult | None:
    """Trận xếp hạng: rating + `matches` + thưởng trong MỘT transaction (docs/05). Lỗi → None + log;
    ván vẫn kết thúc (không chốt được thì không ai mất/được điểm)."""
    from app.rating import service as rating

    p0 = room.player_at(0)
    p1 = room.player_at(1)
    if p0 is None or p1 is None:  # pragma: no cover
        return None
    human = next((p for p in room.players if not p.is_bot), None)
    try:
        async with get_session_factory()() as db:
            if room.bot_strength is not None and human is not None:
                st = await rating.settle_vs_bot(
                    db,
                    match_id=uuid.uuid4(),
                    board=room.board,
                    user_id=uuid.UUID(human.user_id),
                    seat=human.seat,
                    bot_strength=room.bot_strength,
                    winner=over.winner,
                    reason=over.reason,
                    moves=room.moves,
                    scores=list(room.state.scores),
                    started_at=datetime.fromtimestamp((room.started_at or now_ms()) / 1000, UTC),
                )
            else:
                st = await rating.settle(
                    db,
                    match_id=uuid.uuid4(),
                    board=room.board,
                    user_ids=[uuid.UUID(p0.user_id), uuid.UUID(p1.user_id)],
                    winner=over.winner,
                    reason=over.reason,
                    moves=room.moves,
                    scores=list(room.state.scores),
                    started_at=datetime.fromtimestamp((room.started_at or now_ms()) / 1000, UTC),
                )
            await db.commit()
        return m.RankedResult(
            points=st.points,
            points_delta=st.points_delta,
            ranks=[m.RankOut(**r.to_dict()) if r else None for r in st.ranks],  # type: ignore[arg-type]
            rewards=st.rewards,
            placement_left=st.placement_left,
        )
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger("okia.room").exception("không chốt được trận xếp hạng %s", room.id)
        return None


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


def _presence_key(room_id: str) -> str:
    return f"presence:{room_id}"


async def _fresh_members(redis: Redis, room_id: str) -> list[str]:
    key = _presence_key(room_id)
    now = now_ms()
    await redis.zremrangebyscore(key, "-inf", now - PRESENCE_STALE_MS)
    return [str(x) for x in await redis.zrangebyscore(key, now - PRESENCE_STALE_MS, "+inf")]


async def _fresh_count(redis: Redis, room_id: str, user_id: str) -> int:
    return sum(1 for x in await _fresh_members(redis, room_id) if x.split("|", 1)[0] == user_id)


async def presence_add(redis: Redis, room_id: str, user_id: str, conn_id: str) -> int:
    """Kết nối `conn_id` của người này vào phòng; trả số kết nối còn "tươi" của người đó."""
    key = _presence_key(room_id)
    await redis.zadd(key, {f"{user_id}|{conn_id}": now_ms()})
    await redis.expire(key, ROOM_TTL_PLAYING)
    return await _fresh_count(redis, room_id, user_id)


async def presence_touch(redis: Redis, room_id: str, user_id: str, conn_id: str) -> None:
    """Ping định kỳ: làm mới mốc "lần cuối thấy" (kết nối treo không ping → tự coi là rớt)."""
    await redis.zadd(_presence_key(room_id), {f"{user_id}|{conn_id}": now_ms()})


async def presence_remove(redis: Redis, room_id: str, user_id: str, conn_id: str) -> int:
    await redis.zrem(_presence_key(room_id), f"{user_id}|{conn_id}")
    return await _fresh_count(redis, room_id, user_id)


async def online_map(redis: Redis, room_id: str) -> dict[str, bool]:
    return {x.split("|", 1)[0]: True for x in await _fresh_members(redis, room_id)}


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
                is_bot=p.is_bot,
                avatar_url=p.avatar_url,
                rank=m.RankOut(**p.rank) if p.rank else None,  # type: ignore[arg-type]
                online=True if p.is_bot else online.get(p.user_id, False),
            )
            for p in sorted(room.players, key=lambda p: p.seat)
        ],
        state=state_out(room.state),
        deadline=room.deadline,
        result=m.GameOver(**room.result) if room.result else None,
        loadouts={p.user_id: p.loadout for p in room.players if p.loadout},
        grace_seat=room.grace_seat,  # type: ignore[arg-type]
        grace_until=room.grace_until,
    )
