"""Tích hợp WS (docs/04, M1.5–M1.6): hai client thật qua TestClient chơi hết ván 3x3,
kể cả rớt mạng giữa chừng, hết giờ, đầu hàng, kết nối lại."""

import asyncio
import json
import os
from collections.abc import Iterator
from typing import Any

import pytest
import redis.asyncio as aioredis
from starlette.testclient import TestClient, WebSocketTestSession

from app.game import room as rooms
from app.game import timer
from app.main import create_app
from app.ws.hub import Hub

pytestmark = pytest.mark.usefixtures("_clean")


_open: list[WebSocketTestSession] = []


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c
        # Đóng mọi socket còn mở (kể cả khi test fail) để lifespan không treo lúc tắt.
        for ws in _open:
            try:
                ws.__exit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass
        _open.clear()


def guest(c: TestClient, device: str) -> str:
    r = c.post("/auth/guest", json={"deviceId": device})
    assert r.status_code == 200, r.text
    c.cookies.clear()
    return r.json()["accessToken"]


def recv(ws: WebSocketTestSession, t: str | None = None) -> dict[str, Any]:
    """Nhận tin nhắn, bỏ qua các loại khác nếu `t` được chỉ định."""
    for _ in range(20):
        msg = json.loads(ws.receive_text())
        if t is None or msg["t"] == t:
            return msg
    raise AssertionError(f"không nhận được {t}")


def send(ws: WebSocketTestSession, **msg: Any) -> None:
    ws.send_text(json.dumps(msg))


def open_ws(c: TestClient, token: str, lang: str = "vi") -> WebSocketTestSession:
    ws = c.websocket_connect(f"/ws?token={token}&lang={lang}")
    ws.__enter__()
    _open.append(ws)
    return ws


# ---------- Kết nối ----------


def test_ws_rejects_bad_token(client: TestClient) -> None:
    with pytest.raises(Exception):  # noqa: B017 — Starlette ném WebSocketDisconnect khi bị close
        with client.websocket_connect("/ws?token=bad") as ws:
            ws.receive_text()


def test_welcome_and_ping(client: TestClient) -> None:
    tok = guest(client, "device-a-0123456789")
    with client.websocket_connect(f"/ws?token={tok}") as ws:
        w = recv(ws, "welcome")
        assert w["activeRoomId"] is None and w["serverTime"] > 0
        send(ws, t="ping")
        assert recv(ws)["t"] == "pong"
        send(ws, t="nope")
        assert recv(ws, "error")["code"] == "BAD_MESSAGE"
        send(ws, t="queue", mode="casual", board="3x3")
        e = recv(ws, "error")
        assert e["code"] == "UNSUPPORTED" and e["ref"] == "queue"


# ---------- Phòng riêng ----------


def test_private_room_full_game(client: TestClient) -> None:
    ta = guest(client, "device-a-0123456789")
    tb = guest(client, "device-b-0123456789")
    a = open_ws(client, ta)
    b = open_ws(client, tb, "en")
    recv(a, "welcome")
    recv(b, "welcome")

    send(a, t="room_create", board="3x3", turnSeconds=None)
    rs = recv(a, "room_state")
    code = rs["roomId"]
    assert len(code) == 6 and rs["status"] == "waiting" and len(rs["players"]) == 1
    assert rs["players"][0]["online"] is True

    # Mã không tồn tại → ROOM_NOT_FOUND (đã dịch theo lang của client).
    send(b, t="room_join", roomId="ZZZZZZ")
    e = recv(b, "error")
    assert (
        e["code"] == "ROOM_NOT_FOUND" and e["message"] == "Không tìm thấy phòng."
    )  # users.locale ưu tiên hơn ?lang

    send(b, t="room_join", roomId=code.lower())  # chữ thường vẫn vào được
    sa = recv(a, "room_state")
    sb = recv(b, "room_state")
    assert sa["status"] == sb["status"] == "playing"
    assert {p["seat"] for p in sa["players"]} == {0, 1}
    assert sa["deadline"] is None

    # Người thứ ba không vào được.
    tc = guest(client, "device-c-0123456789")
    c = open_ws(client, tc)
    recv(c, "welcome")
    send(c, t="room_join", roomId=code)
    assert recv(c, "error")["code"] == "ROOM_FULL"

    seat_of = {p["userId"]: p["seat"] for p in sa["players"]}
    ua = recv_uid(client, ta)
    socks: dict[int, WebSocketTestSession] = {seat_of[ua]: a, 1 - seat_of[ua]: b}

    # Chơi hết ván: mỗi lượt người có lượt gửi cạnh trống đầu tiên; cả hai nhận `moved`.
    state = sa["state"]
    turn = state["turn"]
    edges = list(state["edges"])
    move_no = 0
    # STALE_SEQ khi seq sai.
    send(socks[turn], t="move", roomId=code, edge=0, seq=99)
    assert recv(socks[turn], "error")["code"] == "STALE_SEQ"
    # NOT_YOUR_TURN khi sai người.
    send(socks[1 - turn], t="move", roomId=code, edge=0, seq=0)
    assert recv(socks[1 - turn], "error")["code"] == "NOT_YOUR_TURN"

    over = None
    while over is None:
        edge = edges.index(-1)
        send(socks[turn], t="move", roomId=code, edge=edge, seq=move_no)
        ma = recv(a, "moved")
        mb = recv(b, "moved")
        assert ma == mb and ma["edge"] == edge and ma["by"] == turn
        edges[edge] = turn
        move_no = ma["moveNo"]
        turn = ma["turn"]
        if move_no == len(edges):
            over = recv(a, "game_over")
            assert recv(b, "game_over") == over
    assert over["reason"] == "complete" and sum(over["scores"]) == 9

    # Sau ván: phòng không còn là phòng đang dở; ghi vào bảng matches.
    r = client.post("/auth/guest", json={"deviceId": "device-a-0123456789"})
    assert r.status_code == 200
    with client.websocket_connect(f"/ws?token={ta}") as a2:
        assert recv(a2, "welcome")["activeRoomId"] is None


def test_disconnect_reconnect_and_resign(client: TestClient) -> None:
    ta = guest(client, "device-a-0123456789")
    tb = guest(client, "device-b-0123456789")
    a = open_ws(client, ta)
    b = open_ws(client, tb)
    recv(a, "welcome")
    recv(b, "welcome")
    send(a, t="room_create", board="3x3", turnSeconds=30)
    code = recv(a, "room_state")["roomId"]
    send(b, t="room_join", roomId=code)
    sa = recv(a, "room_state")
    recv(b, "room_state")
    assert sa["deadline"] is not None

    # b rớt mạng → a nhận opponent_status offline; b kết nối lại → welcome.activeRoomId = phòng.
    b.__exit__(None, None, None)
    st = recv(a, "opponent_status")
    assert st["online"] is False
    b = open_ws(client, tb)
    assert recv(b, "welcome")["activeRoomId"] == code
    send(b, t="room_join", roomId=code)
    sb = recv(b, "room_state")
    assert sb["status"] == "playing" and sb["state"]["moveNo"] == 0
    assert recv(a, "opponent_status")["online"] is True

    # b đầu hàng → cả hai nhận game_over, người thắng là a.
    send(b, t="resign", roomId=code)
    oa = recv(a, "game_over")
    ob = recv(b, "game_over")
    assert oa == ob and oa["reason"] == "resign"
    seat_b = next(p["seat"] for p in sb["players"] if p["userId"] == recv_uid(client, tb))
    assert oa["winner"] == 1 - seat_b


def recv_uid(client: TestClient, token: str) -> str:
    return client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_timeout_moves_and_afk(client: TestClient) -> None:
    ta = guest(client, "device-a-0123456789")
    tb = guest(client, "device-b-0123456789")
    a = open_ws(client, ta)
    b = open_ws(client, tb)
    recv(a, "welcome")
    recv(b, "welcome")
    send(a, t="room_create", board="3x3", turnSeconds=15)
    code = recv(a, "room_state")["roomId"]
    send(b, t="room_join", roomId=code)
    recv(a, "room_state")
    recv(b, "room_state")

    async def force_timeouts(n: int) -> list[dict[str, Any]]:
        """Đẩy deadline về quá khứ rồi gọi tick (như worker) n lần."""
        r = aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        hub = Hub(r)
        outs = []
        try:
            for _ in range(n):
                room = await rooms.load(r, code)
                if room is not None and room.status == "playing":
                    room.deadline = rooms.now_ms() - 1
                    await rooms.save(r, room)
                await timer.tick(r, hub)
                outs.append(await rooms.load(r, code))
        finally:
            await r.aclose()
        return outs

    asyncio.run(force_timeouts(1))
    mv = recv(a, "moved")
    assert mv["reason"] == "timeout" and mv["moveNo"] == 1
    assert recv(b, "moved") == mv
    # Hết giờ 3 lần liên tiếp cho cùng một người → afk (bàn 3x3 có 24 cạnh nên không kịp hết ván).
    over = None
    for _ in range(12):
        asyncio.run(force_timeouts(1))
        m = recv(a, None)
        assert recv(b, None) == m
        if m["t"] == "game_over":
            over = m
            break
    assert over is not None and over["reason"] == "afk"


# ---------- Bể map (docs/03 — Map) ----------


def test_room_create_map_hinh_thu_va_luat_phong(client: TestClient) -> None:
    a = open_ws(client, guest(client, "device-map-a-0123456789"))
    recv(a, "welcome")
    send(a, t="room_create", board="khung-long", turnSeconds=None, showLastMove=False)
    rs = recv(a, "room_state")
    assert rs["board"] == "khung-long" and rs["showLastMove"] is False
    st = rs["state"]
    # Ô / cạnh ngoài mặt nạ là VOID (-2) → client dựng được hình từ chính trạng thái.
    assert -2 in st["owners"] and -2 in st["edges"]
    assert sum(1 for o in st["owners"] if o != -2) == 41


def test_room_create_random_chot_map_trong_be(client: TestClient) -> None:
    from app.game import maps

    pool = {m.id for m in maps.pool()}
    for i in range(3):
        ws = open_ws(client, guest(client, f"device-rand-{i}-0123456789"))
        recv(ws, "welcome")
        send(ws, t="room_create", board="random", turnSeconds=30)
        rs = recv(ws, "room_state")
        assert rs["board"] in pool and rs["showLastMove"] is True


def test_room_create_board_khong_hop_le(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = open_ws(client, guest(client, "device-bad-0123456789"))
    recv(a, "welcome")
    send(a, t="room_create", board="khong-co-map-nay", turnSeconds=30)
    e = recv(a, "error")
    assert e["code"] == "INVALID_BOARD" and e["ref"] == "room_create"
    # Map ẩn (3x3, chỉ cho test) bị từ chối ở production.
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "env", "production")
    send(a, t="room_create", board="3x3", turnSeconds=30)
    assert recv(a, "error")["code"] == "INVALID_BOARD"


# ---------- Biểu cảm & đồ ném (docs/08 — Đồ ném, 2026-10-24) ----------


def test_bieu_cam_va_nem_do(client: TestClient) -> None:
    """Biểu cảm phải thuộc danh sách cố định; đồ ném phải là skin loại throw mình có (default ai
    cũng có; món khác → NOT_OWNED); cả hai dội lại cho CẢ HAI ghế; giãn cách 2 giây; ván xong thì
    không còn tương tác."""
    import redis.asyncio as aioredis

    ta = guest(client, "device-emote-a-0123")
    tb = guest(client, "device-emote-b-0123")
    a = open_ws(client, ta)
    b = open_ws(client, tb)
    recv(a, "welcome")
    recv(b, "welcome")
    send(a, t="room_create", board="3x3", turnSeconds=None)
    code = recv(a, "room_state")["roomId"]
    send(b, t="room_join", roomId=code)
    recv(b, "room_state")
    rs = recv(a, "room_state")
    seat_a = next(p["seat"] for p in rs["players"] if p["userId"] == rs["players"][0]["userId"])
    assert seat_a in (0, 1)

    # Id lạ → BAD_MESSAGE; id đúng → cả hai nhận `emote` với ghế người gửi.
    send(a, t="emote", roomId=code, id="dance")
    assert recv(a, "error")["code"] == "BAD_MESSAGE"
    send(a, t="emote", roomId=code, id="hi")
    ea = recv(a, "emote")
    eb = recv(b, "emote")
    assert ea == eb and ea["id"] == "hi" and ea["by"] in (0, 1)

    # Giãn cách 2 giây: tin thứ hai ngay sau → RATE_LIMITED (ref = emote).
    send(a, t="emote", roomId=code, id="gg")
    e = recv(a, "error")
    assert e["code"] == "RATE_LIMITED" and e["ref"] == "emote"

    async def unthrottle() -> None:
        r = aioredis.from_url(os.environ["REDIS_URL"])
        try:
            for key in await r.keys("rl:interact:*"):
                await r.delete(key)
        finally:
            await r.aclose()

    asyncio.run(unthrottle())
    # Đồ ném: món mặc định ai cũng ném được; món chưa mua → NOT_OWNED; id lạ → UNKNOWN_ITEM.
    send(b, t="throw", roomId=code, id="throw_paper")
    tb_out = recv(b, "throw_out")
    ta_out = recv(a, "throw_out")
    assert ta_out == tb_out and ta_out["id"] == "throw_paper" and ta_out["by"] != ea["by"]
    asyncio.run(unthrottle())
    send(b, t="throw", roomId=code, id="throw_bomb")
    assert recv(b, "error")["code"] == "NOT_OWNED"
    send(b, t="throw", roomId=code, id="throw_nope")
    assert recv(b, "error")["code"] == "UNKNOWN_ITEM"
    send(b, t="throw", roomId="ZZZZZZ", id="throw_paper")
    assert recv(b, "error")["code"] == "ROOM_NOT_FOUND"

    # Người ngoài phòng không ném được vào phòng.
    tc = guest(client, "device-emote-c-0123")
    c = open_ws(client, tc)
    recv(c, "welcome")
    send(c, t="throw", roomId=code, id="throw_paper")
    assert recv(c, "error")["code"] == "ROOM_NOT_FOUND"

    # Ván xong → GAME_OVER.
    send(a, t="resign", roomId=code)
    recv(a, "game_over")
    recv(b, "game_over")
    asyncio.run(unthrottle())
    send(b, t="emote", roomId=code, id="gg")
    assert recv(b, "error")["code"] == "GAME_OVER"


# ---------- Ân hạn rớt mạng (docs/04 — Kết nối lại, 2026-10-24) ----------


def _redis():
    return aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)


async def _tick_now(code: str, *, grace_expired: bool = False) -> None:
    """Đẩy deadline (và hạn ân hạn nếu cần) về quá khứ rồi chạy một nhịp timer như worker."""
    r = _redis()
    hub = Hub(r)
    try:
        room = await rooms.load(r, code)
        assert room is not None
        if room.status == "playing":
            room.deadline = rooms.now_ms() - 1
            if grace_expired and room.grace_until:
                room.grace_until = rooms.now_ms() - 1
            await rooms.save(r, room)
        await timer.tick(r, hub)
    finally:
        await r.aclose()


def _setup_room(client: TestClient, turn_seconds: int | None):
    ta = guest(client, "device-grace-a-0123")
    tb = guest(client, "device-grace-b-0123")
    a = open_ws(client, ta)
    b = open_ws(client, tb)
    recv(a, "welcome")
    recv(b, "welcome")
    send(a, t="room_create", board="3x3", turnSeconds=turn_seconds)
    code = recv(a, "room_state")["roomId"]
    send(b, t="room_join", roomId=code)
    rs = recv(a, "room_state")
    recv(b, "room_state")
    ua, ub = recv_uid(client, ta), recv_uid(client, tb)
    seat = {p["userId"]: p["seat"] for p in rs["players"]}
    return a, b, ta, tb, ua, ub, code, seat, rs


def test_an_han_rot_mang_nguoi_co_luot(client: TestClient) -> None:
    """Người ĐANG CÓ LƯỢT rớt mạng: hết giờ timer không đi hộ mà bắt đầu ân hạn (opponent_status
    kèm graceUntil); nối lại trong ân hạn → room_state lượt mới, bỏ lượt về 0; rớt tiếp và hết
    ân hạn → thua "abandon"."""
    a, b, ta, tb, ua, ub, code, seat, rs = _setup_room(client, 15)
    turn_uid = ua if seat[ua] == rs["state"]["turn"] else ub
    # Người có lượt là "gone"; người kia là "stay".
    gone, stay, gone_tok = (a, b, ta) if turn_uid == ua else (b, a, tb)
    gone_uid = turn_uid
    gone.__exit__(None, None, None)
    st = recv(stay, "opponent_status")
    assert st["online"] is False and st["userId"] == gone_uid and st["graceUntil"] is None

    # Hết giờ lượt → KHÔNG có moved; thay vào đó opponent_status với hạn nối lại.
    asyncio.run(_tick_now(code))
    st = recv(stay, "opponent_status")
    assert st["online"] is False and st["graceUntil"] and st["graceUntil"] > rooms.now_ms()
    asyncio.run(_tick_now(code))  # chưa hết ân hạn → vẫn không đi hộ

    async def snapshot():
        r = _redis()
        try:
            return await rooms.load(r, code)
        finally:
            await r.aclose()

    room = asyncio.run(snapshot())
    assert room is not None and room.state.move_no == 0 and room.grace_seat == seat[gone_uid]

    # Nối lại trong ân hạn → cả phòng nhận room_state: không còn ân hạn, deadline mới.
    gone = open_ws(client, gone_tok)
    assert recv(gone, "welcome")["activeRoomId"] == code
    send(gone, t="room_join", roomId=code)
    back = recv(stay, "room_state")
    assert back["graceUntil"] is None and back["graceSeat"] is None
    assert back["deadline"] and back["deadline"] > rooms.now_ms() + 10_000
    assert all(p["online"] for p in back["players"])
    # Tin về chính mình (online) cũng tới người nối lại — client bỏ qua theo userId.
    own = recv(gone, "opponent_status")
    assert own["online"] is True and own["userId"] == gone_uid

    # Rớt lần nữa, hết ân hạn → abandon, người ở lại thắng.
    gone.__exit__(None, None, None)
    recv(stay, "opponent_status")
    asyncio.run(_tick_now(code))  # bắt đầu ân hạn
    recv(stay, "opponent_status")
    asyncio.run(_tick_now(code, grace_expired=True))
    over = recv(stay, "game_over")
    assert over["reason"] == "abandon" and over["winner"] == 1 - seat[gone_uid]


def test_an_han_phong_khong_gioi_han_gio(client: TestClient) -> None:
    """Phòng không giới hạn giờ: rớt là bắt đầu ân hạn ngay (trước đây treo mãi, không ai thắng)."""
    a, b, ta, tb, ua, ub, code, seat, rs = _setup_room(client, None)
    assert rs["deadline"] is None
    b.__exit__(None, None, None)
    st = recv(a, "opponent_status")
    assert st["online"] is False and st["userId"] == ub and st["graceUntil"]
    asyncio.run(_tick_now(code, grace_expired=True))
    over = recv(a, "game_over")
    assert over["reason"] == "abandon" and over["winner"] == seat[ua]


def test_hien_dien_cu_tu_sach_va_tab_khac_khong_tru(client: TestClient) -> None:
    """Hiện diện là zset theo kết nối, không ping quá 60 giây coi như rớt (API restart không để lại
    bộ đếm sai); tab khác của cùng người chưa vào phòng đóng lại không làm đối thủ thấy 'rớt'."""
    a, b, ta, tb, ua, ub, code, seat, rs = _setup_room(client, 30)

    async def check():
        r = _redis()
        try:
            key = f"presence:{code}"
            # Kết nối "ma" (score cũ) không tính; kết nối thật vẫn online.
            await r.zadd(key, {f"{ub}|deadbeef": rooms.now_ms() - rooms.PRESENCE_STALE_MS - 1})
            online = await rooms.online_map(r, code)
            assert online.get(ua) and online.get(ub)
            assert await r.zscore(key, f"{ub}|deadbeef") is None  # đã dọn
            # Một mình kết nối cũ → sau khi stale thì offline.
            members = await r.zrange(key, 0, -1)
            for mbr in members:
                if mbr.startswith(ub + "|"):
                    await r.zadd(key, {mbr: rooms.now_ms() - rooms.PRESENCE_STALE_MS - 1})
            assert not (await rooms.online_map(r, code)).get(ub)
        finally:
            await r.aclose()

    asyncio.run(check())
    # Tab thứ hai của a (không vào phòng) mở rồi đóng → b KHÔNG nhận opponent_status offline.
    a2 = open_ws(client, ta)
    recv(a2, "welcome")
    a2.__exit__(None, None, None)
    send(b, t="ping")
    assert recv(b)["t"] == "pong"  # không có opponent_status chen vào trước pong
