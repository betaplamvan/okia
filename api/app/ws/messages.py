"""Tin nhắn WebSocket (docs/04). Nguồn chuẩn của schema; xuất JSON Schema → type TS cho web.

Mọi tin nhắn có trường `t`. Client→server và server→client là hai union phân biệt theo `t`.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

# Id map trong bể (app/game/maps.json) hoặc "random"; server kiểm tra, chốt map cụ thể lúc tạo ván.
Board = Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[a-z0-9-]+$")]
TurnSeconds = Literal[15, 30, 60] | None
Seat = Literal[0, 1]


class Msg(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


# ---------- Client → Server ----------


class Queue(Msg):
    t: Literal["queue"]
    mode: Literal["casual", "ranked"]
    # Xếp hạng luôn bốc ngẫu nhiên (bỏ qua giá trị gửi lên); thường: id map hoặc "random".
    board: Board = "random"


class QueueCancel(Msg):
    t: Literal["queue_cancel"]


class MatchAccept(Msg):
    """Chấp nhận trận vừa ghép (trong hạn `match_found.expiresAt`)."""

    t: Literal["match_accept"]
    match_id: str


class MatchDecline(Msg):
    t: Literal["match_decline"]
    match_id: str


class RoomCreate(Msg):
    t: Literal["room_create"]
    board: Board = "5x5"
    turn_seconds: TurnSeconds = 30
    # Luật phòng: đánh dấu các cạnh đối thủ vừa vẽ trong lượt gần nhất (áp dụng cho cả hai người).
    show_last_move: bool = True


class RoomJoin(Msg):
    t: Literal["room_join"]
    room_id: str = Field(min_length=4, max_length=12)


class RoomLeave(Msg):
    """Rời phòng đang chờ (chưa có đối thủ) hoặc phòng đã kết thúc."""

    t: Literal["room_leave"]
    room_id: str


class Move(Msg):
    t: Literal["move"]
    room_id: str
    edge: int = Field(ge=0)
    seq: int = Field(ge=0)


class Resign(Msg):
    t: Literal["resign"]
    room_id: str


# Biểu cảm nhanh trong trận (docs/04): danh sách cố định, không chat tự do. Web giữ bản sao
# (web/src/game/interactions.ts) để hiện emoji.
EMOTES: tuple[str, ...] = ("hi", "gg", "lol", "wow", "cry", "angry", "think", "fire")


class Emote(Msg):
    t: Literal["emote"]
    room_id: str
    id: str = Field(max_length=32)


class Throw(Msg):
    """Ném đồ vào đối thủ (docs/08 — Đồ ném): `id` = skin loại throw mình sở hữu."""

    t: Literal["throw"]
    room_id: str
    id: str = Field(max_length=48)


class Ping(Msg):
    t: Literal["ping"]


class ChatWatch(Msg):
    """Mở khung chat tổng → nhận `chat_msg` theo thời gian thực (docs/15)."""

    t: Literal["chat_watch"]


class ChatUnwatch(Msg):
    t: Literal["chat_unwatch"]


ClientMsg = Annotated[
    Queue
    | QueueCancel
    | MatchAccept
    | MatchDecline
    | RoomCreate
    | RoomJoin
    | RoomLeave
    | Move
    | Resign
    | Emote
    | Throw
    | Ping
    | ChatWatch
    | ChatUnwatch,
    Field(discriminator="t"),
]
client_adapter: TypeAdapter[ClientMsg] = TypeAdapter(ClientMsg)


# ---------- Server → Client ----------


class GameStateOut(Msg):
    rows: int
    cols: int
    edges: list[int]
    owners: list[int]
    scores: list[int]
    turn: Seat
    move_no: int
    finished: bool


class RankOut(Msg):
    """Hạng hiển thị (docs/07): tier + bậc (3 = III … 1 = I, None với Thủ khoa) + điểm."""

    # "topscholar" = danh hiệu Trạng nguyên (Thủ khoa top 100 BXH), gán theo vị trí.
    tier: Literal["scratch", "notebook", "good", "honor", "valedictorian", "topscholar"]
    division: int | None = None
    points: int


class PlayerOut(Msg):
    user_id: str
    name: str
    seat: Seat
    is_bot: bool = False
    avatar_url: str | None = None
    # Chỉ ở phòng xếp hạng; None khi còn phân hạng.
    rank: RankOut | None = None
    online: bool = True


class Welcome(Msg):
    t: Literal["welcome"] = "welcome"
    user_id: str
    active_room_id: str | None = None
    server_time: int  # epoch ms để client bù lệch giờ


class Queued(Msg):
    t: Literal["queued"] = "queued"
    mode: str
    board: Board
    since: int


class QueueStatus(Msg):
    """Worker ghép trận gửi mỗi giây cho người đang chờ: số người chờ, số online, đã chờ bao lâu."""

    t: Literal["queue_status"] = "queue_status"
    mode: str
    waiting: int
    online: int
    since: int
    # Cửa sổ ghép đã mở hết (sau UNLIMITED_AFTER giây) → điểm cược có thể chỉ ±1.
    widened: bool = False


class MatchFound(Msg):
    """Đã ghép được đối thủ, chờ cả hai chấp nhận trước hạn (docs/07 — Chấp nhận trận)."""

    t: Literal["match_found"] = "match_found"
    match_id: str
    mode: str = "ranked"
    expires_at: int  # epoch ms (giờ server)
    accept_seconds: int
    # Đối thủ là máy (chờ lâu): máy đã chấp nhận sẵn, client vẫn hiện vòng chấp nhận / từ chối.
    bot: bool = False


class MatchUpdate(Msg):
    """Số người đã chấp nhận thay đổi (để hiện "chờ người chơi khác")."""

    t: Literal["match_update"] = "match_update"
    match_id: str
    accepted: int


class MatchCancelled(Msg):
    """Trận chờ bị hủy: `by_me` = chính mình từ chối / hết giờ; `requeued` = đã được trả về
    hàng chờ."""

    t: Literal["match_cancelled"] = "match_cancelled"
    match_id: str
    reason: Literal["declined", "timeout", "left"]
    by_me: bool
    requeued: bool


class Matched(Msg):
    t: Literal["matched"] = "matched"
    room_id: str
    mode: str = "ranked"


class RoomState(Msg):
    t: Literal["room_state"] = "room_state"
    room_id: str
    mode: Literal["casual", "ranked", "private"]
    board: Board
    turn_seconds: TurnSeconds
    show_last_move: bool = True
    status: Literal["waiting", "playing", "over"]
    host_id: str
    players: list[PlayerOut]
    state: GameStateOut
    deadline: int | None = None
    result: "GameOver | None" = None
    loadouts: dict[str, dict[str, str]] = Field(default_factory=dict)


class Moved(Msg):
    t: Literal["moved"] = "moved"
    room_id: str
    by: Seat
    edge: int
    captured: list[int]
    scores: list[int]
    turn: Seat
    move_no: int
    deadline: int | None = None
    reason: Literal["player", "timeout"] = "player"


class RankedResult(Msg):
    """Kết quả xếp hạng theo ghế (docs/07): điểm hạng mới, thay đổi, hạng, thưởng Ruột chì."""

    points: list[int]
    points_delta: list[int]
    ranks: list[RankOut | None]
    rewards: list[dict[str, int]]
    placement_left: list[int]


class GameOver(Msg):
    t: Literal["game_over"] = "game_over"
    room_id: str
    winner: Seat | None
    scores: list[int]
    reason: Literal["complete", "resign", "afk", "abandon"]
    # Chỉ ở trận xếp hạng (None nếu không chốt được — đã ghi log).
    ranked: RankedResult | None = None


class OpponentStatus(Msg):
    t: Literal["opponent_status"] = "opponent_status"
    room_id: str
    online: bool


class EmoteOut(Msg):
    t: Literal["emote"] = "emote"
    room_id: str
    by: Seat
    id: str


class ThrowOut(Msg):
    t: Literal["throw_out"] = "throw_out"
    room_id: str
    by: Seat
    id: str


class BotSay(Msg):
    t: Literal["bot_say"] = "bot_say"
    room_id: str
    text: str
    event: str


class MatchReview(Msg):
    t: Literal["match_review"] = "match_review"
    match_id: str
    text: str
    key_move: int | None = None


class Error(Msg):
    t: Literal["error"] = "error"
    code: str
    message: str
    ref: str | None = None


class Pong(Msg):
    t: Literal["pong"] = "pong"


class ChatReplyOut(Msg):
    """Trích dẫn tin được trả lời (rút gọn)."""

    id: int
    name: str
    body: str
    deleted: bool = False


class ChatMessageOut(Msg):
    """Một tin chat tổng (docs/15) — dùng chung cho REST `GET /chat/messages` và WS `chat_msg`."""

    id: int
    user_id: str
    name: str
    avatar_url: str | None = None
    # Đã ủng hộ (Trống Đồng Tri Ân) — hiện huy hiệu nhỏ cạnh tên.
    donor: bool = False
    # Hạng mùa hiện tại (None = chưa xong phân hạng).
    rank: RankOut | None = None
    body: str
    created_at: str
    reply: ChatReplyOut | None = None


class ChatMsg(Msg):
    t: Literal["chat_msg"] = "chat_msg"
    message: ChatMessageOut


ServerMsg = Annotated[
    Welcome
    | Queued
    | QueueStatus
    | MatchFound
    | MatchUpdate
    | MatchCancelled
    | Matched
    | RoomState
    | Moved
    | GameOver
    | OpponentStatus
    | EmoteOut
    | ThrowOut
    | BotSay
    | MatchReview
    | Error
    | Pong
    | ChatMsg,
    Field(discriminator="t"),
]
server_adapter: TypeAdapter[ServerMsg] = TypeAdapter(ServerMsg)

RoomState.model_rebuild()


def dump(msg: BaseModel) -> str:
    return msg.model_dump_json(by_alias=True)
