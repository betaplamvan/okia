"""Luồng xác thực theo docs/13: khách, đăng ký/đăng nhập, phiên, email, Google, hồ sơ."""

import re
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from app.auth import google
from app.auth.emails import outbox

DEVICE = "device-0123456789abcdef"
EMAIL = "an@example.com"
PASSWORD = "giay-o-li-2026"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def guest(client: AsyncClient, device: str = DEVICE) -> dict:
    r = await client.post("/auth/guest", json={"deviceId": device})
    assert r.status_code == 200, r.text
    return r.json()


def link_token(purpose: str) -> str:
    """Lấy token từ email cuối cùng trong outbox (console provider)."""
    msg = [m for m in outbox().sent if m.purpose == purpose][-1]
    m = re.search(r"/auth/(?:verify|reset)\?token=([\w\-.]+)", msg.text)
    assert m, msg.text
    return m.group(1)


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


# ---------- Email + mật khẩu ----------


async def test_register_upgrades_guest_and_sends_verify(client: AsyncClient) -> None:
    g = await guest(client)
    r = await client.post(
        "/auth/register",
        json={"email": " An@Example.com ", "password": PASSWORD, "displayName": "An"},
        headers=bearer(g["accessToken"]),
    )
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["id"] == g["user"]["id"]  # giữ user_id khi nâng cấp khách
    assert u["isGuest"] is False
    assert u["email"] == EMAIL
    assert u["emailVerified"] is False
    assert u["identities"] == [{"provider": "password", "subject": EMAIL}]
    assert [m.purpose for m in outbox().sent] == ["verify"]
    assert outbox().sent[0].to == EMAIL
    assert "Xác minh email" in outbox().sent[0].subject

    # Xác minh: một lần duy nhất.
    token = link_token("verify")
    r = await client.post("/auth/verify", json={"token": token})
    assert r.status_code == 200
    assert r.json()["user"]["emailVerified"] is True
    r = await client.post("/auth/verify", json={"token": token})
    assert r.json()["code"] == "TOKEN_USED"
    r = await client.post("/auth/verify", json={"token": "x.y.z"})
    assert r.json()["code"] == "TOKEN_INVALID"


async def test_register_without_guest_and_login(client: AsyncClient) -> None:
    r = await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["user"]["displayName"].startswith("Bạn ")
    r = await client.post("/auth/login", json={"email": EMAIL, "password": "sai-roi-nhe"})
    assert r.status_code == 401
    assert r.json()["code"] == "INVALID_CREDENTIALS"
    r = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["switched"] is False


@pytest.mark.parametrize(
    ("email", "pw"),
    [
        (EMAIL, "ngan"),
        (EMAIL, "123456789"),
        (EMAIL, "Password"),
        ("hocsinhgioi@example.com", "hocsinhgioi"),  # trùng phần tên của email
    ],
)
async def test_weak_password_rejected(client: AsyncClient, email: str, pw: str) -> None:
    r = await client.post("/auth/register", json={"email": email, "password": pw})
    assert r.status_code == 422
    assert r.json()["code"] == "WEAK_PASSWORD"


async def test_duplicate_register_does_not_leak(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    outbox().sent.clear()
    g = await guest(client, "device-khac-0123456789")
    r = await client.post(
        "/auth/register",
        json={"email": EMAIL, "password": "mat-khau-khac-123"},
        headers=bearer(g["accessToken"]),
    )
    assert r.status_code == 200  # phản hồi như thành công
    assert r.json()["user"]["isGuest"] is True  # nhưng khách không được nâng cấp
    assert [m.purpose for m in outbox().sent] == ["duplicate"]
    # Không có phiên nào: trả 202 CHECK_EMAIL.
    client.cookies.clear()
    r = await client.post("/auth/register", json={"email": EMAIL, "password": "mat-khau-khac-123"})
    assert r.status_code == 202
    assert r.json()["code"] == "CHECK_EMAIL"


async def test_guest_login_into_existing_account_switches(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    client.cookies.clear()
    g = await guest(client, "device-moi-0123456789")
    r = await client.post(
        "/auth/login", json={"email": EMAIL, "password": PASSWORD}, headers=bearer(g["accessToken"])
    )
    assert r.status_code == 200
    assert r.json()["switched"] is True
    assert r.json()["user"]["id"] != g["user"]["id"]
    # User khách đã bị xóa mềm → token cũ hết hiệu lực.
    r = await client.get("/me", headers=bearer(g["accessToken"]))
    assert r.status_code == 401


async def test_login_rate_limited(client: AsyncClient) -> None:
    for _ in range(5):
        r = await client.post("/auth/login", json={"email": EMAIL, "password": "x" * 8})
        assert r.status_code == 401
    r = await client.post("/auth/login", json={"email": EMAIL, "password": "x" * 8})
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMITED"
    assert r.json()["retryAfter"] > 0
    assert "Retry-After" in r.headers


async def test_forgot_and_reset(client: AsyncClient) -> None:
    r = await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    old_access = r.json()["accessToken"]
    outbox().sent.clear()
    r = await client.post("/auth/forgot", json={"email": "khong-co@example.com"})
    assert r.status_code == 200 and outbox().sent == []
    r = await client.post("/auth/forgot", json={"email": EMAIL})
    assert r.status_code == 200
    token = link_token("reset")
    r = await client.post("/auth/reset", json={"token": token, "password": "mat-khau-moi-2026"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["emailVerified"] is True
    # Phiên cũ bị vô hiệu (token_version tăng), mật khẩu mới dùng được, token một lần.
    r = await client.get("/me", headers=bearer(old_access))
    assert r.status_code == 401
    r = await client.post("/auth/login", json={"email": EMAIL, "password": "mat-khau-moi-2026"})
    assert r.status_code == 200
    r = await client.post("/auth/reset", json={"token": token, "password": "mat-khau-moi-2027"})
    assert r.json()["code"] == "TOKEN_USED"


async def test_resend_verify_limited(client: AsyncClient) -> None:
    r = await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    tok = r.json()["accessToken"]
    for _ in range(3):
        assert (await client.post("/auth/resend-verify", headers=bearer(tok))).status_code == 200
    assert (await client.post("/auth/resend-verify", headers=bearer(tok))).status_code == 429
    assert len([m for m in outbox().sent if m.purpose == "verify"]) == 4


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


async def test_google_new_account(client: AsyncClient, fake_google) -> None:
    path, q = await google_roundtrip(client)
    assert path == "/" and q["auth"] == ["google"] and q["switched"] == ["0"]
    assert "okia_refresh" in client.cookies
    r = await client.post("/auth/refresh")
    u = r.json()["user"]
    assert u["email"] == EMAIL and u["emailVerified"] is True and u["isGuest"] is False
    assert u["displayName"] == "An Nguyễn"
    assert u["avatarUrl"] == "https://img/x.png"
    assert u["identities"] == [{"provider": "google", "subject": None}]


async def test_google_upgrades_guest(client: AsyncClient, fake_google) -> None:
    g = await guest(client)
    path, q = await google_roundtrip(client, g["accessToken"], return_to="/play")
    assert path == "/play" and q["switched"] == ["0"]
    r = await client.post("/auth/refresh")
    assert r.json()["user"]["id"] == g["user"]["id"]
    assert r.json()["user"]["emailVerified"] is True


async def test_google_links_verified_email_account(client: AsyncClient, fake_google) -> None:
    r = await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    uid = r.json()["user"]["id"]
    # Chưa xác minh → không tự gộp.
    path, q = await google_roundtrip(client)
    assert q["auth"] == ["error"] and q["code"] == ["IDENTITY_TAKEN"]
    await client.post("/auth/verify", json={"token": link_token("verify")})
    client.cookies.clear()
    path, q = await google_roundtrip(client)
    assert q["auth"] == ["google"]
    u = (await client.post("/auth/refresh")).json()["user"]
    assert u["id"] == uid
    assert sorted(i["provider"] for i in u["identities"]) == ["google", "password"]


async def test_google_taken_by_other_account(client: AsyncClient, fake_google) -> None:
    await google_roundtrip(client)  # tài khoản A có Google
    client.cookies.clear()
    r = await client.post("/auth/register", json={"email": "b@example.com", "password": PASSWORD})
    b = r.json()["accessToken"]
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


# ---------- Identity & xóa ----------


async def test_set_password_and_remove_identity(client: AsyncClient, fake_google) -> None:
    await google_roundtrip(client)
    tok = (await client.post("/auth/refresh")).json()["accessToken"]
    r = await client.delete("/me/identities/google", headers=bearer(tok))
    assert r.json()["code"] == "LAST_IDENTITY"
    r = await client.post("/me/password", json={"password": PASSWORD}, headers=bearer(tok))
    assert r.status_code == 200
    r = await client.post("/me/password", json={"password": PASSWORD}, headers=bearer(tok))
    assert r.json()["code"] == "IDENTITY_EXISTS"
    r = await client.delete("/me/identities/google", headers=bearer(tok))
    assert r.status_code == 200
    assert [i["provider"] for i in r.json()["identities"]] == ["password"]


async def test_guest_cannot_set_password(client: AsyncClient) -> None:
    g = await guest(client)
    r = await client.post(
        "/me/password", json={"password": PASSWORD}, headers=bearer(g["accessToken"])
    )
    assert r.status_code == 403 and r.json()["code"] == "GUEST_NOT_ALLOWED"


async def test_delete_me(client: AsyncClient) -> None:
    r = await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    tok = r.json()["accessToken"]
    r = await client.delete("/me", headers=bearer(tok))
    assert r.status_code == 200
    assert (await client.get("/me", headers=bearer(tok))).status_code == 401
    r = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 401
    # Email được giải phóng để đăng ký lại.
    r = await client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200


async def test_device_cannot_reopen_upgraded_account(client: AsyncClient) -> None:
    """Khách nâng cấp rồi đăng xuất: device id cũ phải cho ra KHÁCH MỚI, không phải tài khoản."""
    g = await guest(client)
    r = await client.post(
        "/auth/register",
        json={"email": EMAIL, "password": PASSWORD},
        headers=bearer(g["accessToken"]),
    )
    assert r.json()["user"]["id"] == g["user"]["id"]
    await client.post("/auth/logout")
    again = await guest(client)
    assert again["user"]["id"] != g["user"]["id"]
    assert again["user"]["isGuest"] is True
    # Tài khoản thật vẫn đăng nhập được bình thường.
    r = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.json()["user"]["id"] == g["user"]["id"]
