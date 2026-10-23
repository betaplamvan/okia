"""Chat tổng (docs/15): khách chỉ đọc, tài khoản Google gửi được; giới hạn tốc độ / chống lặp;
trả lời trích dẫn; phân trang; meta (online + id cuối); tin mới phát qua WS cho ai đang mở chat."""

import json

import pytest
import redis.asyncio as aioredis
from httpx import AsyncClient
from starlette.testclient import TestClient

from app.chat.router import clean_body
from app.main import create_app
from tests.conftest import TEST_REDIS_URL

pytestmark = pytest.mark.usefixtures("_clean")


async def login(client: AsyncClient, email: str, name: str | None = None) -> dict[str, str]:
    body: dict[str, str] = {"email": email}
    if name:
        body["displayName"] = name
    r = await client.post("/auth/dev-login", json=body)
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}


async def guest(client: AsyncClient, device: str) -> dict[str, str]:
    r = await client.post("/auth/guest", json={"deviceId": device})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}


async def unthrottle(uid_hint: str = "") -> None:
    """Xóa bộ đếm tốc độ chat để test gửi liên tiếp."""
    r = aioredis.from_url(TEST_REDIS_URL)
    for key in await r.keys("rl:chat:*"):
        await r.delete(key)
    await r.aclose()


def test_lam_sach_noi_dung() -> None:
    assert clean_body("  chào   \r\n\r\n\r\n\r\nbạn  ") == "chào\n\nbạn"
    assert clean_body("a\nb\nc\nd\ne\nf\ng\nh") == "a\nb\nc\nd\ne\nf g h"
    assert clean_body(" \n \n ") == ""


async def test_khach_doc_tai_khoan_gui(client: AsyncClient) -> None:
    g = await guest(client, "chat-guest-1")
    an = await login(client, "an@example.com", "An")

    # Khách đọc được (trống), không gửi được.
    r = await client.get("/chat/messages", headers=g)
    assert r.status_code == 200 and r.json() == {"items": [], "hasMore": False}
    r = await client.post("/chat/messages", json={"body": "hi"}, headers=g)
    assert r.status_code == 403 and r.json()["code"] == "GUEST_NOT_ALLOWED"
    # Không đăng nhập: đọc được, gửi 401.
    assert (await client.get("/chat/messages")).status_code == 200
    assert (await client.post("/chat/messages", json={"body": "hi"})).status_code == 401

    r = await client.post("/chat/messages", json={"body": "  Chào cả nhà  "}, headers=an)
    assert r.status_code == 200, r.text
    first = r.json()
    assert first["body"] == "Chào cả nhà" and first["name"] == "An"
    assert first["donor"] is False and first["rank"] is None and first["reply"] is None

    # Trống / quá dài.
    await unthrottle()
    r = await client.post("/chat/messages", json={"body": "   "}, headers=an)
    assert r.status_code == 400 and r.json()["code"] == "CHAT_EMPTY"
    r = await client.post("/chat/messages", json={"body": "x" * 301}, headers=an)
    assert r.status_code == 400 and r.json()["code"] == "CHAT_TOO_LONG"

    # Trả lời trích dẫn.
    await unthrottle()
    r = await client.post(
        "/chat/messages", json={"body": "ok nha", "replyTo": first["id"]}, headers=an
    )
    assert r.json()["reply"] == {
        "id": first["id"],
        "name": "An",
        "body": "Chào cả nhà",
        "deleted": False,
    }
    # Trả lời id không tồn tại → bỏ trích dẫn.
    await unthrottle()
    r = await client.post("/chat/messages", json={"body": "hả", "replyTo": 999999}, headers=an)
    assert r.json()["reply"] is None

    # Khách thấy đủ 3 tin, cũ → mới; meta trả id cuối.
    r = await client.get("/chat/messages", headers=g)
    items = r.json()["items"]
    assert [i["body"] for i in items] == ["Chào cả nhà", "ok nha", "hả"]
    meta = (await client.get("/chat/meta", headers=g)).json()
    assert meta["lastId"] == items[-1]["id"]
    assert meta["online"] >= 1  # người gọi meta được tính online


async def test_gioi_han_toc_do_va_chong_lap(client: AsyncClient) -> None:
    an = await login(client, "an2@example.com")
    assert (await client.post("/chat/messages", json={"body": "1"}, headers=an)).status_code == 200
    # Tin thứ hai ngay sau đó → 429 kèm retryAfter.
    r = await client.post("/chat/messages", json={"body": "2"}, headers=an)
    assert r.status_code == 429 and r.json()["code"] == "RATE_LIMITED"
    # Hết hạn 2 giây (xóa bộ đếm) nhưng lặp đúng nội dung (khác hoa thường / khoảng trắng) → chặn.
    await unthrottle()
    r = await client.post("/chat/messages", json={"body": "  1 "}, headers=an)
    assert r.status_code == 429 and r.json()["code"] == "CHAT_DUPLICATE"
    await unthrottle()
    assert (await client.post("/chat/messages", json={"body": "3"}, headers=an)).status_code == 200


async def test_phan_trang(client: AsyncClient) -> None:
    an = await login(client, "an3@example.com")
    for i in range(55):
        await unthrottle()
        r = await client.post("/chat/messages", json={"body": f"tin {i}"}, headers=an)
        assert r.status_code == 200, r.text
    page = (await client.get("/chat/messages")).json()
    assert page["hasMore"] is True and len(page["items"]) == 50
    assert page["items"][0]["body"] == "tin 5" and page["items"][-1]["body"] == "tin 54"
    older = (await client.get(f"/chat/messages?before={page['items'][0]['id']}")).json()
    assert older["hasMore"] is False
    assert [i["body"] for i in older["items"]] == [f"tin {i}" for i in range(5)]


def test_tin_moi_phat_qua_ws() -> None:
    with TestClient(create_app()) as c:
        r = c.post("/auth/dev-login", json={"email": "ws-chat@example.com", "displayName": "Bình"})
        tok = r.json()["accessToken"]
        c.cookies.clear()
        r = c.post("/auth/guest", json={"deviceId": "chat-ws-guest"})
        gtok = r.json()["accessToken"]
        c.cookies.clear()
        with (
            c.websocket_connect(f"/ws?token={gtok}") as watcher,
            c.websocket_connect(f"/ws?token={tok}") as other,
        ):
            assert json.loads(watcher.receive_text())["t"] == "welcome"
            assert json.loads(other.receive_text())["t"] == "welcome"
            # Chỉ người mở chat (chat_watch) nhận tin; ping để chắc server đã xử lý watch.
            watcher.send_text(json.dumps({"t": "chat_watch"}))
            watcher.send_text(json.dumps({"t": "ping"}))
            assert json.loads(watcher.receive_text())["t"] == "pong"
            r = c.post(
                "/chat/messages",
                json={"body": "xin chào"},
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r.status_code == 200, r.text
            msg = json.loads(watcher.receive_text())
            assert msg["t"] == "chat_msg"
            assert msg["message"]["body"] == "xin chào" and msg["message"]["name"] == "Bình"
            # Người không mở chat không nhận gì: lượt tiếp theo của họ là pong.
            other.send_text(json.dumps({"t": "ping"}))
            assert json.loads(other.receive_text())["t"] == "pong"
            # Đóng chat → không nhận nữa.
            watcher.send_text(json.dumps({"t": "chat_unwatch"}))
            watcher.send_text(json.dumps({"t": "ping"}))
            assert json.loads(watcher.receive_text())["t"] == "pong"
