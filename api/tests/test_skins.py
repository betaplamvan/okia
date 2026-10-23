"""Shop & skin (docs/06 — Shop, docs/08, ADR-0013): catalog khớp shared/, giá theo bậc, mua lẻ trừ
đúng ví trong một transaction, trang bị phải sở hữu, loadout đi trong room_state, khách chỉ xem."""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.skins import catalog
from tests.skin_fixtures import install_test_skins, install_test_skins_sync

SHARED = Path(__file__).resolve().parents[2] / "shared" / "skins"


def bearer(tok: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


async def account(client: AsyncClient, email: str, lead: int = 0, flower: int = 0) -> str:
    r = await client.post("/auth/dev-login", json={"email": email, "lead": lead, "flower": flower})
    assert r.status_code == 200, r.text
    return r.json()["accessToken"]


# ---------- Catalog ----------


def test_ban_chep_catalog_khop_shared() -> None:
    """Sửa shared/skins/**.json xong phải chạy `pnpm gen:skins` (web/scripts/gen-skins.mjs)."""
    src = []
    for t in catalog.TYPES:
        for f in sorted((SHARED / t).glob("*.json")):
            src.append(json.loads(f.read_text(encoding="utf-8")))
    copy = json.loads((Path(catalog.__file__).with_name("catalog.json")).read_text("utf-8"))
    assert copy["skins"] == src


def test_catalog_hop_le() -> None:
    """Seed: hai skin default bút / ô (ADR-0014; skin khác nhập qua admin) + bộ đồ ném khởi đầu
    (2026-10-24: 8 món, throw_paper mặc định)."""
    seed = {m["id"] for m in catalog.seed_manifests()}
    assert {"pen_default", "box_default", "throw_paper", "throw_bomb"} <= seed
    assert sum(m["type"] == "throw" for m in catalog.seed_manifests()) == 8
    assert catalog.default_ids() == {"pen_default", "box_default", "throw_paper"}
    skins = catalog.all_skins()
    for s in skins.values():
        assert s.type in catalog.TYPES and s.rarity in catalog.RARITIES
        assert s.name["vi"] and s.name["en"] and s.description["vi"] and s.description["en"]
    assert catalog.default_loadout() == {"pen": "pen_default", "box": "box_default"}
    assert catalog.get_skin("pen_default").price == {}  # type: ignore[union-attr]
    assert catalog.rarity_price()["uncommon"] == {"lead": 250}
    assert catalog.rarity_price()["legendary"] == {"flower": 5}


# ---------- Shop ----------


async def test_mua_trang_bi_va_tu_choi(client: AsyncClient) -> None:
    await install_test_skins(client)
    tok = await account(client, "an@example.com", lead=700, flower=5)
    me = (await client.get("/me", headers=bearer(tok))).json()
    assert me["loadout"] == {"pen": "pen_default", "box": "box_default"}
    assert me["wallet"] == {"lead": 700, "flower": 5}

    r = await client.get("/me/skins", headers=bearer(tok))
    assert r.status_code == 200
    mine = r.json()
    assert mine["owned"] == ["box_default", "pen_default", "throw_paper"]
    assert mine["canBuy"] is True

    # Mua bút dạ (250 Ruột chì) → ví 450, kho có; mua lại → ALREADY_OWNED, ví không đổi.
    r = await client.post("/me/skins/pen_marker/buy", headers=bearer(tok))
    assert r.status_code == 200, r.text
    assert r.json()["wallet"] == {"lead": 450, "flower": 5}
    assert "pen_marker" in r.json()["owned"]
    r = await client.post("/me/skins/pen_marker/buy", headers=bearer(tok))
    assert r.status_code == 409 and r.json()["code"] == "ALREADY_OWNED"
    r = await client.post("/me/skins/pen_default/buy", headers=bearer(tok))
    assert r.status_code == 409 and r.json()["code"] == "ALREADY_OWNED"
    r = await client.post("/me/skins/khong-co/buy", headers=bearer(tok))
    assert r.status_code == 404 and r.json()["code"] == "UNKNOWN_ITEM"
    # Bút vàng tốn 5 Hoa; bút tím 1500 Ruột chì → không đủ, ví không đổi.
    r = await client.post("/me/skins/pen_neon/buy", headers=bearer(tok))
    assert r.status_code == 409 and r.json()["code"] == "INSUFFICIENT_FUNDS"
    r = await client.post("/me/skins/pen_gold/buy", headers=bearer(tok))
    assert r.status_code == 200 and r.json()["wallet"] == {"lead": 450, "flower": 0}

    # Trang bị: phải sở hữu và đúng loại.
    r = await client.put("/me/loadout", json={"pen": "pen_marker"}, headers=bearer(tok))
    assert r.status_code == 200 and r.json()["loadout"] == {
        "pen": "pen_marker",
        "box": "box_default",
    }
    r = await client.put("/me/loadout", json={"box": "box_seal"}, headers=bearer(tok))
    assert r.status_code == 403 and r.json()["code"] == "NOT_OWNED"
    r = await client.put("/me/loadout", json={"box": "pen_marker"}, headers=bearer(tok))
    assert r.status_code == 404 and r.json()["code"] == "UNKNOWN_ITEM"
    r = await client.put("/me/loadout", json={"pen": "pen_gold"}, headers=bearer(tok))
    assert r.json()["loadout"]["pen"] == "pen_gold"
    assert (await client.get("/me", headers=bearer(tok))).json()["loadout"]["pen"] == "pen_gold"
    # Sổ cái: hai dòng purchase, nguồn đúng.
    assert (await client.get("/me/progress", headers=bearer(tok))).json()["wallet"] == {
        "lead": 450,
        "flower": 0,
    }


async def test_khach_chi_xem(client: AsyncClient) -> None:
    await install_test_skins(client)
    r = await client.post("/auth/guest", json={"deviceId": "device-guest-0123456789"})
    tok = r.json()["accessToken"]
    r = await client.get("/me/skins", headers=bearer(tok))
    assert r.status_code == 200 and r.json()["canBuy"] is False
    r = await client.post("/me/skins/pen_marker/buy", headers=bearer(tok))
    assert r.status_code == 403 and r.json()["code"] == "GUEST_NOT_ALLOWED"
    r = await client.put("/me/loadout", json={"pen": "pen_default"}, headers=bearer(tok))
    assert r.status_code == 403
    r = await client.get("/skins")
    assert r.status_code == 200 and len(r.json()) == len(catalog.all_skins())


@pytest.mark.usefixtures("_clean")
def test_loadout_trong_room_state() -> None:
    """Phòng riêng: room_state.loadouts có skin của cả hai (đối thủ thấy bút/ô của mình)."""
    from starlette.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as c:
        install_test_skins_sync(c)
        ra = c.post("/auth/dev-login", json={"email": "a@example.com", "lead": 300})
        ta = ra.json()["accessToken"]
        c.cookies.clear()
        assert c.post("/me/skins/pen_marker/buy", headers=bearer(ta)).status_code == 200
        assert (
            c.put("/me/loadout", json={"pen": "pen_marker"}, headers=bearer(ta)).status_code == 200
        )
        tb = c.post("/auth/guest", json={"deviceId": "device-b-0123456789"}).json()["accessToken"]
        c.cookies.clear()

        def recv(ws, t: str) -> dict:  # type: ignore[no-untyped-def,type-arg]
            for _ in range(10):
                msg = ws.receive_json()
                if msg["t"] == t:
                    return msg
            raise AssertionError(t)

        with (
            c.websocket_connect(f"/ws?token={ta}") as a,
            c.websocket_connect(f"/ws?token={tb}") as b,
        ):
            recv(a, "welcome")
            recv(b, "welcome")
            a.send_json({"t": "room_create", "board": "3x3", "turnSeconds": None})
            rs = recv(a, "room_state")
            uid_a = rs["players"][0]["userId"]
            assert rs["loadouts"][uid_a] == {"pen": "pen_marker", "box": "box_default"}
            b.send_json({"t": "room_join", "roomId": rs["roomId"]})
            sb = recv(b, "room_state")
            assert len(sb["loadouts"]) == 2
            uid_b = next(p["userId"] for p in sb["players"] if p["userId"] != uid_a)
            assert sb["loadouts"][uid_b] == {"pen": "pen_default", "box": "box_default"}
