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


class Emote(Msg):
    t: Literal["emote"]
    room_id: str
    id: str = Field(max_length=32)


class Ping(Msg):
    t: Literal["ping"]


ClientMsg = Annotated[
    Queue | QueueCancel | RoomCreate | RoomJoin | RoomLeave | Move | Resign | Emote | Ping,
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


class PlayerOut(Msg):
    user_id: str
    name: str
    seat: Seat
    is_bot: bool = False
    tier: str | None = None
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


class Matched(Msg):
    t: Literal["matched"] = "matched"
    room_id: str


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


class GameOver(Msg):
    t: Literal["game_over"] = "game_over"
    room_id: str
    winner: Seat | None
    scores: list[int]
    reason: Literal["complete", "resign", "afk", "abandon"]
    rating_delta: list[float] | None = None
    rewards: dict[str, int] | None = None


class OpponentStatus(Msg):
    t: Literal["opponent_status"] = "opponent_status"
    room_id: str
    online: bool


class EmoteOut(Msg):
    t: Literal["emote"] = "emote"
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


ServerMsg = Annotated[
    Welcome
    | Queued
    | Matched
    | RoomState
    | Moved
    | GameOver
    | OpponentStatus
    | EmoteOut
    | BotSay
    | MatchReview
    | Error
    | Pong,
    Field(discriminator="t"),
]
server_adapter: TypeAdapter[ServerMsg] = TypeAdapter(ServerMsg)

RoomState.model_rebuild()


def dump(msg: BaseModel) -> str:
    return msg.model_dump_json(by_alias=True)
