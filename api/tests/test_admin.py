"""Quản trị (docs/13 — Admin): quyền theo ADMIN_EMAILS, thống kê, người chơi, skin portable,
thông số."""

import json

import pytest
from httpx import AsyncClient

from app.admin import config as appconfig
from app.skins import catalog
from tests.skin_fixtures import fixture_manifests, install_test_skins

pytestmark = pytest.mark.usefixtures("_clean")


async def login(client: AsyncClient, email: str) -> dict[str, str]:
    r = await client.post("/auth/dev-login", json={"email": email})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}


async def test_quyen_admin_theo_email(client: AsyncClient) -> None:
    admin = await login(client, "admin@example.com")  # conftest: ADMIN_EMAILS=admin@example.com
    user = await login(client, "thuong@example.com")
    r = await client.get("/me", headers=admin)
    assert r.json()["isAdmin"] is True
    r = await client.get("/me", headers=user)
    assert r.json()["isAdmin"] is False
    assert (await client.get("/admin/stats", headers=user)).status_code == 403
    assert (await client.get("/admin/stats")).status_code == 401
    r = await client.get("/admin/stats", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accountsTotal"] >= 2 and body["usersTotal"] >= body["accountsTotal"]
    assert body["season"]["name"]["vi"]
    assert "connections" in body and "roomsPlaying" in body


async def test_nguoi_choi_tim_cong_tien_khoa(client: AsyncClient) -> None:
    admin = await login(client, "admin@example.com")
    victim = await login(client, "nan-nhan@example.com")
    uid = (await client.get("/me", headers=victim)).json()["id"]

    r = await client.get("/admin/users", params={"q": "nan-nhan"}, headers=admin)
    assert r.status_code == 200 and [u["id"] for u in r.json()["items"]] == [uid]
    assert r.json()["total"] == 1
    r = await client.get("/admin/users", params={"q": uid}, headers=admin)
    assert [u["id"] for u in r.json()["items"]] == [uid]
    # Mặc định chỉ tài khoản liên kết; khách phải lọc riêng; phân trang có total.
    await client.post("/auth/guest", json={"deviceId": "guest-admin-00000000"})
    client.cookies.clear()
    r = await client.get("/admin/users", params={"limit": 1}, headers=admin)
    assert r.json()["total"] >= 2 and len(r.json()["items"]) == 1
    assert all(not u["isGuest"] for u in r.json()["items"])
    r = await client.get("/admin/users", params={"kind": "guest"}, headers=admin)
    assert r.json()["total"] >= 1 and all(u["isGuest"] for u in r.json()["items"])

    r = await client.post(
        f"/admin/users/{uid}/grant", json={"lead": 500, "flower": 2, "note": "test"}, headers=admin
    )
    assert r.status_code == 200 and r.json()["lead"] == 500 and r.json()["flower"] == 2
    r = await client.post(f"/admin/users/{uid}/grant", json={"lead": -100}, headers=admin)
    assert r.json()["lead"] == 400
    r = await client.get("/me", headers=victim)
    assert r.json()["wallet"] == {"lead": 400, "flower": 2}

    r = await client.patch(f"/admin/users/{uid}", json={"displayName": "Bé Na"}, headers=admin)
    assert r.json()["displayName"] == "Bé Na"

    # Quảng cáo theo người (docs/10): danh sách có adFree / donations; bật tắt được.
    assert r.json()["adFree"] is False and r.json()["donations"] == 0
    r = await client.post(f"/admin/users/{uid}/ads", json={"adFree": True}, headers=admin)
    assert r.status_code == 200 and r.json()["adFree"] is True
    assert (await client.get("/me", headers=victim)).json()["adFree"] is True
    r = await client.post(f"/admin/users/{uid}/ads", json={"adFree": False}, headers=admin)
    assert r.json()["adFree"] is False
    assert (await client.get("/me", headers=victim)).json()["adFree"] is False

    # Khóa: token cũ hết hiệu lực ngay (token_version), refresh bị BANNED, đăng nhập lại cũng bị.
    r = await client.post(f"/admin/users/{uid}/ban", json={"days": 7}, headers=admin)
    assert r.status_code == 200 and r.json()["bannedUntil"]
    assert (await client.get("/me", headers=victim)).status_code == 401
    r = await client.post("/auth/dev-login", json={"email": "nan-nhan@example.com"})
    assert r.status_code == 403 and r.json()["code"] == "BANNED"
    client.cookies.clear()
    r = await client.get(f"/admin/users/{uid}", headers=admin)
    assert r.status_code == 200 and r.json()["identities"] and r.json()["matches"] == []
    # Mở khóa → đăng nhập lại được.
    r = await client.post(f"/admin/users/{uid}/ban", json={"days": None}, headers=admin)
    assert r.json()["bannedUntil"] is None
    r = await client.post("/auth/dev-login", json={"email": "nan-nhan@example.com"})
    assert r.status_code == 200
    client.cookies.clear()


def _sample_pen(skin_id: str) -> dict:  # type: ignore[type-arg]
    src = json.loads(json.dumps(next(m for m in fixture_manifests() if m["id"] == "pen_marker")))
    src["id"] = skin_id
    src["name"] = {"vi": "Bút test", "en": "Test pen"}
    src["default"] = False
    return src


async def test_skin_them_sua_xoa_export_import(client: AsyncClient) -> None:
    admin = await login(client, "admin@example.com")
    r = await client.get("/admin/skins", headers=admin)
    assert r.status_code == 200
    before = {s["id"] for s in r.json()}
    assert "pen_default" in before and all(s["owners"] >= 0 for s in r.json())

    sid = "pen_test_admin"
    try:
        # Thêm (manifest hợp lệ) → có ngay trong catalog + /skins (tiến trình này).
        r = await client.put(
            f"/admin/skins/{sid}", json={"manifest": _sample_pen(sid)}, headers=admin
        )
        assert r.status_code == 200, r.text
        assert catalog.get_skin(sid) is not None
        ids = {s["id"] for s in (await client.get("/skins")).json()}
        assert sid in ids
        # Manifest hỏng → 400; id khác URL → 400.
        bad = _sample_pen(sid)
        del bad["pen"]
        r = await client.put(f"/admin/skins/{sid}", json={"manifest": bad}, headers=admin)
        assert r.status_code == 400 and r.json()["code"] == "BAD_SKIN"
        r = await client.put(
            f"/admin/skins/{sid}", json={"manifest": _sample_pen("pen_khac")}, headers=admin
        )
        assert r.status_code == 400
        # Sửa metadata (PATCH): tên + bậc đổi, hiệu ứng giữ nguyên; export đơn lẻ trả manifest.
        r = await client.patch(
            f"/admin/skins/{sid}",
            json={"name": {"vi": "Bút đổi tên", "en": "Renamed"}, "rarity": "rare"},
            headers=admin,
        )
        assert r.status_code == 200, r.text
        assert r.json()["manifest"]["name"]["vi"] == "Bút đổi tên" and r.json()["rarity"] == "rare"
        assert r.json()["manifest"]["pen"] == _sample_pen(sid)["pen"]
        one = (await client.get(f"/admin/skins/{sid}/export", headers=admin)).json()
        assert one["id"] == sid and one["forms"]
        # Tắt → biến khỏi catalog nhưng vẫn trong export.
        r = await client.put(
            f"/admin/skins/{sid}",
            json={"manifest": _sample_pen(sid), "enabled": False},
            headers=admin,
        )
        assert r.status_code == 200 and catalog.get_skin(sid) is None
        exp = (await client.get("/admin/skins/export?format=json", headers=admin)).json()
        assert any(m["id"] == sid for m in exp["skins"])
        # Skin default không xóa / tắt được.
        assert (await client.delete("/admin/skins/pen_default", headers=admin)).status_code == 409
        # Import (không replace) ghi đè + bật lại.
        r = await client.post(
            "/admin/skins/import", json={"skins": [_sample_pen(sid)]}, headers=admin
        )
        assert r.status_code == 200 and catalog.get_skin(sid) is not None
        # Import replace không cần default trong file: default luôn giữ, skin khác bị xóa.
        r = await client.post(
            "/admin/skins/import",
            json={"skins": [_sample_pen(sid)], "replace": True},
            headers=admin,
        )
        assert r.status_code == 200, r.text
        assert catalog.get_skin("pen_default") is not None
        assert {s["id"] for s in r.json()} == {"pen_default", "box_default", sid}
    finally:
        r = await client.delete(f"/admin/skins/{sid}", headers=admin)
        assert r.status_code in (200, 404)
        await install_test_skins(client, admin)
    assert catalog.get_skin(sid) is None
    ids = {s["id"] for s in (await client.get("/admin/skins", headers=admin)).json()}
    assert ids >= {"pen_default", "box_default", "pen_marker"}


async def test_xoa_tat_ca_tru_mac_dinh(client: AsyncClient) -> None:
    await install_test_skins(client)
    admin = await login(client, "admin@example.com")
    r = await client.post("/auth/dev-login", json={"email": "mua@example.com", "lead": 300})
    client.cookies.clear()
    user = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    assert (await client.post("/me/skins/pen_marker/buy", headers=user)).status_code == 200
    assert (await client.post("/admin/skins/purge", headers=user)).status_code == 403
    r = await client.post("/admin/skins/purge", headers=admin)
    assert r.status_code == 200 and r.json()["deleted"] >= 6
    ids = {s["id"] for s in (await client.get("/admin/skins", headers=admin)).json()}
    assert ids == {"pen_default", "box_default"}
    assert catalog.get_skin("pen_marker") is None
    # Kho sở hữu giữ nguyên: nhập lại cùng id là có lại ngay.
    assert (await client.get("/me/skins", headers=user)).json()["owned"] == [
        "box_default",
        "pen_default",
    ]
    await install_test_skins(client)
    assert "pen_marker" in (await client.get("/me/skins", headers=user)).json()["owned"]


async def test_thong_so(client: AsyncClient) -> None:
    await install_test_skins(client)
    admin = await login(client, "admin@example.com")
    r = await client.get("/admin/config", headers=admin)
    assert r.status_code == 200 and r.json()["values"]["ranked_win_lead"] == 30
    r = await client.put(
        "/admin/config",
        json={"ranked_win_lead": 45, "rarity_price": {"common": {"lead": 120}}},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["values"]["ranked_win_lead"] == 45
    # Vùng quảng cáo giả: thông số bool, public qua GET /site.
    site = (await client.get("/site")).json()
    assert site == {"adsMock": False, "adsInterstitialEvery": 3, "chatEnabled": True}
    r = await client.put("/admin/config", json={"ads_mock": True}, headers=admin)
    assert r.status_code == 200 and r.json()["values"]["ads_mock"] is True
    assert (await client.get("/site")).json()["adsMock"] is True
    assert (
        await client.put("/admin/config", json={"ads_mock": 1}, headers=admin)
    ).status_code == 400
    await client.put("/admin/config", json={"ads_mock": False}, headers=admin)
    assert appconfig.get_int("ranked_win_lead", 30) == 45
    assert catalog.get_skin("pen_marker").price == {"lead": 250}  # type: ignore[union-attr]
    assert catalog.rarity_price()["common"] == {"lead": 120}
    # Thông số số nguyên có khoảng cho phép; bool phải đúng kiểu; public qua /site khi cần.
    r = await client.put(
        "/admin/config",
        json={"mm_accept_seconds": 30, "chat_enabled": False, "ads_interstitial_every": 0},
        headers=admin,
    )
    assert r.status_code == 200
    assert (await client.get("/site")).json() == {
        "adsMock": False,
        "adsInterstitialEvery": 0,
        "chatEnabled": False,
    }
    from app.matchmaking import pending as pd

    assert pd.accept_seconds() == 30
    for bad in ({"mm_accept_seconds": 4}, {"mm_accept_seconds": 61}, {"chat_enabled": "no"}):
        assert (await client.put("/admin/config", json=bad, headers=admin)).status_code == 400
    assert pd.accept_seconds() == 30
    await client.put(
        "/admin/config",
        json={"mm_accept_seconds": 20, "chat_enabled": True, "ads_interstitial_every": 3},
        headers=admin,
    )
    # Khóa lạ / giá trị sai → 400, không đổi gì.
    assert (await client.put("/admin/config", json={"x": 1}, headers=admin)).status_code == 400
    r = await client.put("/admin/config", json={"ranked_win_lead": -1}, headers=admin)
    assert r.status_code == 400 and appconfig.get_int("ranked_win_lead", 30) == 45
    # Đặt lại mặc định cho các test khác.
    await client.put(
        "/admin/config",
        json={"ranked_win_lead": 30, "rarity_price": appconfig.DEFAULTS["rarity_price"]},
        headers=admin,
    )
