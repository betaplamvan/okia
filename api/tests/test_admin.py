"""Quản trị (docs/13 — Admin): quyền theo ADMIN_EMAILS, thống kê, người chơi, skin portable,
thông số."""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.admin import config as appconfig
from app.skins import catalog

pytestmark = pytest.mark.usefixtures("_clean")

SHARED = Path(__file__).parents[2] / "shared" / "skins"


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
    assert r.status_code == 200 and [u["id"] for u in r.json()] == [uid]
    r = await client.get("/admin/users", params={"q": uid}, headers=admin)
    assert [u["id"] for u in r.json()] == [uid]

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
    src = json.loads((SHARED / "pen" / "pen_marker.json").read_text(encoding="utf-8"))
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
        # Tắt → biến khỏi catalog nhưng vẫn trong export.
        r = await client.put(
            f"/admin/skins/{sid}",
            json={"manifest": _sample_pen(sid), "enabled": False},
            headers=admin,
        )
        assert r.status_code == 200 and catalog.get_skin(sid) is None
        exp = (await client.get("/admin/skins/export", headers=admin)).json()
        assert any(m["id"] == sid for m in exp["skins"])
        # Skin default không xóa / tắt được.
        assert (await client.delete("/admin/skins/pen_default", headers=admin)).status_code == 409
        # Import (không replace) ghi đè + bật lại.
        r = await client.post(
            "/admin/skins/import", json={"skins": [_sample_pen(sid)]}, headers=admin
        )
        assert r.status_code == 200 and catalog.get_skin(sid) is not None
        # Import replace thiếu default → từ chối, không mất gì.
        r = await client.post(
            "/admin/skins/import",
            json={"skins": [_sample_pen(sid)], "replace": True},
            headers=admin,
        )
        assert r.status_code == 400 and catalog.get_skin("pen_default") is not None
    finally:
        r = await client.delete(f"/admin/skins/{sid}", headers=admin)
        assert r.status_code in (200, 404)
    assert catalog.get_skin(sid) is None
    assert {s["id"] for s in (await client.get("/admin/skins", headers=admin)).json()} == before


async def test_thong_so(client: AsyncClient) -> None:
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
    assert appconfig.get_int("ranked_win_lead", 30) == 45
    assert catalog.get_skin("pen_marker").price == {"lead": 250}  # type: ignore[union-attr]
    assert catalog.rarity_price()["common"] == {"lead": 120}
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
