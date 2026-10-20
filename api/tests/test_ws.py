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
