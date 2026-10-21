"""Luồng xác thực theo docs/13 (ADR-0011): khách, phiên, Google, dev-login, hồ sơ."""

from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from app.auth import google
from app.auth.emails import outbox

DEVICE = "device-0123456789abcdef"
EMAIL = "an@example.com"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def guest(client: AsyncClient, device: str = DEVICE) -> dict:
    r = await client.post("/auth/guest", json={"deviceId": device})
    assert r.status_code == 200, r.text
    return r.json()


async def dev_login(client: AsyncClient, email: str = EMAIL, access: str | None = None) -> dict:
    r = await client.post(
        "/auth/dev-login", json={"email": email}, headers=bearer(access) if access else {}
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Khách ----------


async def test_guest_login_is_idempotent_per_device(client: AsyncClient) -> None:
    a = await guest(client)
    b = await guest(client)
    assert a["user"]["id"] == b["user"]["id"]
    assert a["user"]["isGuest"] is True
    assert a["user"]["displayName"].startswith("Bạn ")
    assert a["user"]["identities"] == []
    assert "okia_refresh" in client.cookies


async def test_guest_locale_from_accept_language(client: AsyncClient) -> None:
    r = await client.post(
        "/auth/guest", json={"deviceId": DEVICE}, headers={"accept-language": "en"}
    )
    assert r.json()["user"]["locale"] == "en"
    assert r.json()["user"]["displayName"].startswith("Player ")


async def test_me_requires_token(client: AsyncClient) -> None:
    r = await client.get("/me")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"
    r = await client.get("/me", headers={"accept-language": "en", **bearer("bad")})
    assert r.json() == {"code": "UNAUTHORIZED", "message": "Please sign in."}


async def test_patch_me(client: AsyncClient) -> None:
    g = await guest(client)
    r = await client.patch(
        "/me", json={"displayName": "  Tí   Sún ", "locale": "en"}, headers=bearer(g["accessToken"])
    )
    assert r.status_code == 200
    assert r.json()["displayName"] == "Tí Sún"
    assert r.json()["locale"] == "en"


async def test_password_endpoints_are_gone(client: AsyncClient) -> None:
    """ADR-0011: không còn đăng ký/đăng nhập/đặt lại mật khẩu."""
    for path in ("/auth/register", "/auth/login", "/auth/forgot", "/auth/reset", "/auth/verify"):
        r = await client.post(path, json={"email": EMAIL, "password": "x" * 12})
        assert r.status_code in (404, 405), path


# ---------- Phiên ----------


async def test_refresh_rotates_and_detects_reuse(client: AsyncClient) -> None:
    await guest(client)
    old = client.cookies["okia_refresh"]
    r = await client.post("/auth/refresh")
    assert r.status_code == 200
    new = client.cookies["okia_refresh"]
    assert new != old
    # Dùng lại token cũ → toàn bộ phiên bị thu hồi.
    client.cookies.set("okia_refresh", old, path="/auth")
    r = await client.post("/auth/refresh")
    assert r.status_code == 401
    client.cookies.set("okia_refresh", new, path="/auth")
    r = await client.post("/auth/refresh")
    assert r.status_code == 401


async def test_refresh_rejects_foreign_origin(client: AsyncClient) -> None:
    await guest(client)
    r = await client.post("/auth/refresh", headers={"origin": "https://evil.example"})
    assert r.status_code == 401


async def test_logout_all_invalidates_access_tokens(client: AsyncClient) -> None:
    g = await guest(client)
    r = await client.post("/auth/logout-all", headers=bearer(g["accessToken"]))
    assert r.status_code == 200
    r = await client.get("/me", headers=bearer(g["accessToken"]))
    assert r.status_code == 401
    r = await client.post("/auth/refresh")
    assert r.status_code == 401


async def test_new_login_replaces_old_session(client: AsyncClient) -> None:
    """Một phiên mỗi tài khoản: đăng nhập nơi mới → nơi cũ mất access lẫn refresh."""
    a = await dev_login(client)
    cookie_a = client.cookies["okia_refresh"]
    client.cookies.clear()
    b = await dev_login(client)
    r = await client.get("/me", headers=bearer(a["accessToken"]))
    assert r.status_code == 401
    cookie_b = client.cookies["okia_refresh"]
    client.cookies.set("okia_refresh", cookie_a, path="/auth")
    r = await client.post("/auth/refresh")
    assert r.status_code == 401
    assert r.json()["code"] == "SESSION_REPLACED"
    # Nơi cũ refresh hỏng không được coi là dùng lại token → phiên mới vẫn sống.
    client.cookies.set("okia_refresh", cookie_b, path="/auth")
    assert (await client.get("/me", headers=bearer(b["accessToken"]))).status_code == 200
    assert (await client.post("/auth/refresh")).status_code == 200


async def test_guest_sessions_are_not_replaced(client: AsyncClient) -> None:
    a = await guest(client)
    b = await guest(client)
    assert (await client.get("/me", headers=bearer(a["accessToken"]))).status_code == 200
    assert (await client.get("/me", headers=bearer(b["accessToken"]))).status_code == 200


# ---------- Google ----------


@pytest.fixture
def fake_google(monkeypatch: pytest.MonkeyPatch):
    profile = google.GoogleProfile(
        sub="google-sub-1", email=EMAIL, name="An Nguyễn", picture="https://img/x.png"
    )

    async def exchange(code: str, verifier: str) -> google.GoogleProfile:
        assert code == "good-code"
        return profile

    monkeypatch.setattr(google, "exchange", exchange)
    return profile


async def google_roundtrip(client: AsyncClient, access: str | None = None, return_to: str = "/"):
    r = await client.post(
        "/auth/google/start",
        params={"return_to": return_to},
        headers=bearer(access) if access else {},
    )
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    q = parse_qs(urlparse(url).query)
    assert q["code_challenge_method"] == ["S256"]
    assert q["redirect_uri"] == ["http://localhost:8000/auth/google/callback"]
    r = await client.get(
        "/auth/google/callback", params={"state": q["state"][0], "code": "good-code"}
    )
    assert r.status_code == 303
    loc = urlparse(r.headers["location"])
    return loc.path, parse_qs(loc.query)


async def test_google_new_account_sends_welcome(client: AsyncClient, fake_google) -> None:
    outbox().sent.clear()
    path, q = await google_roundtrip(client)
    assert path == "/" and q["auth"] == ["google"] and q["switched"] == ["0"]
    assert "okia_refresh" in client.cookies
    r = await client.post("/auth/refresh")
    u = r.json()["user"]
    assert u["email"] == EMAIL and u["emailVerified"] is True and u["isGuest"] is False
    assert u["displayName"] == "An Nguyễn"
    assert u["avatarUrl"] == "https://img/x.png"
    assert u["identities"] == [{"provider": "google"}]
    # Thư chào mừng theo locale, bố cục sticker có logo + nút vào game.
    assert [m.purpose for m in outbox().sent] == ["welcome"]
    m = outbox().sent[0]
    assert m.to == EMAIL and "An Nguyễn" in m.subject
    assert "/brand/logo-email.png" in m.html and "http://localhost:3000" in m.text
    # Đăng nhập lại cùng Google → không gửi thêm thư.
    client.cookies.clear()
    await google_roundtrip(client)
    assert len(outbox().sent) == 1


async def test_google_upgrades_guest(client: AsyncClient, fake_google) -> None:
    outbox().sent.clear()
    g = await guest(client)
    path, q = await google_roundtrip(client, g["accessToken"], return_to="/play")
    assert path == "/play" and q["switched"] == ["0"]
    r = await client.post("/auth/refresh")
    assert r.json()["user"]["id"] == g["user"]["id"]
    assert r.json()["user"]["emailVerified"] is True
    assert [m.purpose for m in outbox().sent] == ["welcome"]


async def test_guest_switches_to_existing_google_account(client: AsyncClient, fake_google) -> None:
    first, _ = await google_roundtrip(client)
    uid = (await client.post("/auth/refresh")).json()["user"]["id"]
    client.cookies.clear()
    g = await guest(client, "device-moi-0123456789")
    path, q = await google_roundtrip(client, g["accessToken"])
    assert q["switched"] == ["1"]
    assert (await client.post("/auth/refresh")).json()["user"]["id"] == uid
    # User khách đã bị xóa mềm → token cũ hết hiệu lực.
    assert (await client.get("/me", headers=bearer(g["accessToken"]))).status_code == 401


async def test_google_links_verified_email_account(client: AsyncClient, fake_google) -> None:
    """Tài khoản cũ cùng email đã xác minh (vd. từ trước ADR-0011) → Google liên kết vào."""
    uid = (await dev_login(client))["user"]["id"]
    client.cookies.clear()
    path, q = await google_roundtrip(client)
    assert q["auth"] == ["google"]
    u = (await client.post("/auth/refresh")).json()["user"]
    assert u["id"] == uid


async def test_google_taken_by_other_account(client: AsyncClient, fake_google) -> None:
    await google_roundtrip(client)  # tài khoản A có Google
    client.cookies.clear()
    b = (await dev_login(client, "b@example.com"))["accessToken"]
    path, q = await google_roundtrip(client, b)
    assert q["code"] == ["IDENTITY_TAKEN"]


async def test_google_disabled_without_config(client: AsyncClient, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "google_client_id", "")
    r = await client.post("/auth/google/start")
    assert r.status_code == 503 and r.json()["code"] == "GOOGLE_DISABLED"


async def test_google_bad_state(client: AsyncClient) -> None:
    r = await client.get("/auth/google/callback", params={"state": "nope", "code": "x"})
    assert r.status_code == 303 and "code=OAUTH_STATE" in r.headers["location"]


# ---------- dev-login ----------


async def test_dev_login_upgrades_guest_without_email(client: AsyncClient) -> None:
    outbox().sent.clear()
    g = await guest(client)
    out = await dev_login(client, access=g["accessToken"])
    assert out["user"]["id"] == g["user"]["id"]
    assert out["user"]["isGuest"] is False and out["user"]["emailVerified"] is True
    assert outbox().sent == []  # dev-login không gửi thư


async def test_dev_login_blocked_in_production(client: AsyncClient, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "env", "production")
    r = await client.post("/auth/dev-login", json={"email": EMAIL})
    assert r.status_code == 404


# ---------- Xóa & thiết bị ----------


async def test_delete_me(client: AsyncClient, fake_google) -> None:
    await google_roundtrip(client)
    tok = (await client.post("/auth/refresh")).json()["accessToken"]
    r = await client.delete("/me", headers=bearer(tok))
    assert r.status_code == 200
    assert (await client.get("/me", headers=bearer(tok))).status_code == 401
    # Google đăng nhập lại → tài khoản MỚI (identity đã xóa), email được giải phóng.
    client.cookies.clear()
    await google_roundtrip(client)
    u = (await client.post("/auth/refresh")).json()["user"]
    assert u["email"] == EMAIL


async def test_device_cannot_reopen_upgraded_account(client: AsyncClient, fake_google) -> None:
    """Khách nâng cấp rồi đăng xuất: device id cũ phải cho ra KHÁCH MỚI, không phải tài khoản."""
    g = await guest(client)
    await google_roundtrip(client, g["accessToken"])
    await client.post("/auth/logout")
    again = await guest(client)
    assert again["user"]["id"] != g["user"]["id"]
    assert again["user"]["isGuest"] is True
    # Tài khoản thật vẫn vào được qua Google.
    client.cookies.clear()
    await google_roundtrip(client)
    assert (await client.post("/auth/refresh")).json()["user"]["id"] == g["user"]["id"]
