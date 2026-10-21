"""Giới hạn kết nối WS và cache đường nối (docs/04 — Giới hạn, docs/13 — Bảo mật)."""

import asyncio
import json
import os
from collections.abc import Iterator

import asyncpg
import pytest
from starlette.testclient import TestClient, WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.auth import ws_cache
from app.config import get_settings
from app.main import create_app
from app.ws import endpoint

pytestmark = pytest.mark.usefixtures("_clean")

_open: list[WebSocketTestSession] = []


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c
        for ws in _open:
            try:
                ws.__exit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass
        _open.clear()


def guest(c: TestClient, device: str) -> tuple[str, str]:
    r = c.post("/auth/guest", json={"deviceId": f"limits-{device}-00000000"})
    assert r.status_code == 200, r.text
    c.cookies.clear()
    return r.json()["accessToken"], r.json()["user"]["id"]


def open_ws(c: TestClient, token: str) -> WebSocketTestSession:
    ws = c.websocket_connect(f"/ws?token={token}")
    ws.__enter__()
    _open.append(ws)
    assert json.loads(ws.receive_text())["t"] == "welcome"
    return ws


def test_max_connections_per_user(client: TestClient) -> None:
    tok, _ = guest(client, "limit-user")
    limit = get_settings().ws_max_conn_per_user
    for _ in range(limit):
        open_ws(client, tok)
    with pytest.raises(WebSocketDisconnect) as e:
        open_ws(client, tok)
    assert e.value.code == endpoint.CLOSE_TOO_MANY
    # Đóng một kết nối → lại nối được.
    _open.pop(0).__exit__(None, None, None)
    open_ws(client, tok)


def test_flood_closes_connection(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    cfg = get_settings()
    monkeypatch.setattr(cfg, "ws_msg_burst", 40)  # conftest nới cho test chơi nhanh; siết lại ở đây
    monkeypatch.setattr(cfg, "ws_msg_per_second", 20)
    tok, _ = guest(client, "flood")
    ws = open_ws(client, tok)
    with pytest.raises(WebSocketDisconnect) as e:
        for _ in range(cfg.ws_msg_burst + 5):
            ws.send_text('{"t":"ping"}')
        for _ in range(cfg.ws_msg_burst + 5):
            ws.receive_text()
    assert e.value.code == endpoint.CLOSE_FLOOD


def test_oversize_message_closes_connection(client: TestClient) -> None:
    tok, _ = guest(client, "big")
    ws = open_ws(client, tok)
    ws.send_text(json.dumps({"t": "ping", "pad": "x" * (get_settings().ws_max_msg_bytes + 1)}))
    with pytest.raises(WebSocketDisconnect) as e:
        ws.receive_text()
    assert e.value.code == endpoint.CLOSE_FLOOD


async def _bump_token_version(user_id: str) -> None:
    conn = await asyncpg.connect(
        os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    )
    try:
        await conn.execute(
            "UPDATE users SET token_version = token_version + 1 WHERE id = $1::uuid", user_id
        )
    finally:
        await conn.close()


def test_ws_cache_serves_connect_and_invalidates(client: TestClient) -> None:
    tok, uid = guest(client, "cache")
    open_ws(client, tok).__exit__(None, None, None)  # lần đầu: tra DB, ghi cache
    _open.clear()
    redis = client.app.state.redis  # type: ignore[attr-defined]
    cached = client.portal.call(ws_cache.get, redis, uid)  # type: ignore[attr-defined]
    assert cached is not None and cached.token_version == 1

    # Đổi token_version thẳng trong DB (không qua API) → cache vẫn cho nối: chứng tỏ không tra DB.
    asyncio.run(_bump_token_version(uid))
    open_ws(client, tok).__exit__(None, None, None)
    _open.clear()

    # Xóa cache → tra DB → token cũ bị từ chối 4401.
    client.portal.call(ws_cache.invalidate, redis, uid)  # type: ignore[attr-defined]
    with pytest.raises(WebSocketDisconnect) as e:
        open_ws(client, tok)
    assert e.value.code == endpoint.CLOSE_UNAUTHORIZED


def test_logout_all_invalidates_cache(client: TestClient) -> None:
    tok, uid = guest(client, "logout-all")
    open_ws(client, tok).__exit__(None, None, None)
    _open.clear()
    r = client.post("/auth/logout-all", headers={"authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    with pytest.raises(WebSocketDisconnect) as e:
        open_ws(client, tok)
    assert e.value.code == endpoint.CLOSE_UNAUTHORIZED


def test_new_login_kicks_old_ws(client: TestClient) -> None:
    """Một phiên mỗi tài khoản (docs/13): đăng nhập nơi mới đóng WS nơi cũ với 4409, token cũ
    không nối lại được nữa."""

    def login() -> str:
        r = client.post("/auth/dev-login", json={"email": "kick@example.com"})
        assert r.status_code == 200, r.text
        client.cookies.clear()
        return r.json()["accessToken"]

    old = login()
    ws = open_ws(client, old)
    new = login()
    with pytest.raises(WebSocketDisconnect) as e:
        ws.receive_text()
    assert e.value.code == endpoint.CLOSE_SESSION_REPLACED
    with pytest.raises(WebSocketDisconnect) as e:
        open_ws(client, old)
    assert e.value.code == endpoint.CLOSE_UNAUTHORIZED
    open_ws(client, new)
