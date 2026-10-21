"""Ví hai loại tiền, điểm danh, nhiệm vụ, avatar (ADR-0010, docs/06 — test bắt buộc)."""

import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from PIL import Image

from app.db import get_session_factory
from app.economy import checkin, quests, wallet
from app.errors import AppError

EMAIL = "an@example.com"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def verified_account(client: AsyncClient, email: str = EMAIL) -> tuple[str, str]:
    """Tài khoản đã xác minh (dev-login, như đăng nhập Google) → (access token, user id)."""
    r = await client.post("/auth/dev-login", json={"email": email})
    assert r.status_code == 200, r.text
    return r.json()["accessToken"], r.json()["user"]["id"]


# ---------- Ví ----------


async def test_wallet_idempotent_and_insufficient(client: AsyncClient) -> None:
    _, uid = await verified_account(client)
    user_id = uuid.UUID(uid)
    async with get_session_factory()() as db:
        assert await wallet.credit(db, user_id, "lead", 30, source="match", idempotency_key="m1")
        assert not await wallet.credit(
            db, user_id, "lead", 30, source="match", idempotency_key="m1"
        )
        await db.commit()
        assert await wallet.balances(db, user_id) == {"lead": 30, "flower": 0}
        with pytest.raises(AppError) as e:
            await wallet.debit(db, user_id, "lead", 31, source="purchase", idempotency_key="b1")
        assert e.value.code == "INSUFFICIENT_FUNDS"
        await db.rollback()
        assert await wallet.balances(db, user_id) == {"lead": 30, "flower": 0}
        await wallet.grant(
            db, user_id, {"lead": 5, "flower": 2}, source="quest", ref="x", idempotency_key="q1"
        )
        await db.commit()
        assert await wallet.balances(db, user_id) == {"lead": 35, "flower": 2}


async def test_me_includes_wallet(client: AsyncClient) -> None:
    tok, uid = await verified_account(client)
    async with get_session_factory()() as db:
        await wallet.credit(db, uuid.UUID(uid), "flower", 3, source="admin", idempotency_key="a")
        await db.commit()
    r = await client.get("/me", headers=bearer(tok))
    assert r.json()["wallet"] == {"lead": 0, "flower": 3}


# ---------- Điểm danh ----------


async def test_checkin_cycle_and_streak_reset(client: AsyncClient) -> None:
    _, uid = await verified_account(client)
    user_id = uuid.UUID(uid)
    t0 = datetime(2026, 10, 20, 3, 0, tzinfo=UTC)  # 10:00 giờ VN
    async with get_session_factory()() as db:
        total = {"lead": 0, "flower": 0}
        for i in range(7):
            st, reward = await checkin.check_in(db, user_id, now=t0 + timedelta(days=i))
            assert st.checked_today and st.streak == i + 1 and st.cycle_day == i + 1
            for k, v in reward.items():
                total[k] += v
        await db.commit()
        assert total == {"lead": 120, "flower": 1}
        assert await wallet.balances(db, user_id) == total
        # Điểm danh hai lần một ngày → lỗi.
        with pytest.raises(AppError) as e:
            await checkin.check_in(db, user_id, now=t0 + timedelta(days=6, hours=5))
        assert e.value.code == "ALREADY_CHECKED_IN"
        await db.rollback()
        # Ngày 8 liên tiếp → vòng lại ngày 1 của chu kỳ.
        st, reward = await checkin.check_in(db, user_id, now=t0 + timedelta(days=7))
        assert st.streak == 8 and st.cycle_day == 1 and reward == {"lead": 10}
        await db.commit()
        # Lỡ một ngày → về ngày 1, streak 1.
        st, _ = await checkin.check_in(db, user_id, now=t0 + timedelta(days=9))
        assert st.streak == 1 and st.cycle_day == 1
        await db.commit()
        # Ranh giới ngày theo giờ VN: 23:30 VN (16:30 UTC) và 00:30 VN hôm sau là hai ngày.
        st = await checkin.status(db, user_id, now=t0 + timedelta(days=9, hours=13, minutes=30))
        assert st.checked_today
        st = await checkin.status(db, user_id, now=t0 + timedelta(days=9, hours=14, minutes=30))
        assert not st.checked_today and st.streak == 1 and st.cycle_day == 2


async def test_checkin_endpoint_requires_verified(client: AsyncClient) -> None:
    r = await client.post("/auth/guest", json={"deviceId": "device-0123456789abcdef"})
    g = r.json()["accessToken"]
    r = await client.post("/me/checkin", headers=bearer(g))
    assert r.status_code == 403 and r.json()["code"] == "GUEST_NOT_ALLOWED"
    r = await client.get("/me/progress", headers=bearer(g))
    assert r.status_code == 200 and r.json()["canClaim"] is False
    assert len(r.json()["quests"]) == len(quests.CATALOG)

    client.cookies.clear()
    tok, _ = await verified_account(client)
    r = await client.post("/me/checkin", headers=bearer(tok))
    assert r.status_code == 200, r.text
    assert r.json()["reward"] == {"lead": 10}
    p = r.json()["progress"]
    assert p["wallet"] == {"lead": 10, "flower": 0}
    assert p["checkin"]["checkedToday"] is True and p["checkin"]["cycleDay"] == 1
    r = await client.post("/me/checkin", headers=bearer(tok))
    assert r.json()["code"] == "ALREADY_CHECKED_IN"


# ---------- Nhiệm vụ ----------


async def test_quests_progress_claim_and_weekly(client: AsyncClient) -> None:
    tok, uid = await verified_account(client)
    user_id = uuid.UUID(uid)
    now = datetime(2026, 10, 21, 5, 0, tzinfo=UTC)
    async with get_session_factory()() as db:
        for won, combo in [(True, 1), (False, 4), (True, 2)]:
            await quests.record_game(db, user_id, won=won, online=False, max_combo=combo, now=now)
        await db.commit()
        views, _, _ = await quests.snapshot(db, user_id, now=now)
        by = {v.id: v for v in views}
        assert by["d_play3"].progress == 3 and by["w_play15"].progress == 3
        assert by["d_win1"].progress == 1  # kẹp ở target
        assert by["d_combo3"].progress == 3  # max(1, 4, 2) kẹp về 3
        assert by["w_win_online3"].progress == 0
        # Nhận thưởng: đúng một lần, nuôi nhiệm vụ tuần "đều đặn".
        assert await quests.claim(db, user_id, "d_play3", now=now) == {"lead": 10}
        await db.commit()
        with pytest.raises(AppError) as e:
            await quests.claim(db, user_id, "d_play3", now=now)
        assert e.value.code == "QUEST_CLAIMED"
        await db.rollback()
        with pytest.raises(AppError) as e:
            await quests.claim(db, user_id, "w_win_online3", now=now)
        assert e.value.code == "QUEST_NOT_DONE"
        await db.rollback()
        views, _, _ = await quests.snapshot(db, user_id, now=now)
        by = {v.id: v for v in views}
        assert by["d_play3"].claimed and by["w_daily5"].progress == 1
        # Sang ngày mới: nhiệm vụ ngày về 0, nhiệm vụ tuần giữ.
        views, _, _ = await quests.snapshot(db, user_id, now=now + timedelta(days=1))
        by = {v.id: v for v in views}
        assert by["d_play3"].progress == 0 and not by["d_play3"].claimed
        assert by["w_play15"].progress == 3
        assert await wallet.balances(db, user_id) == {"lead": 10, "flower": 0}


async def test_events_endpoint_feeds_quests(client: AsyncClient) -> None:
    tok, _ = await verified_account(client)
    r = await client.post(
        "/me/events",
        json={"type": "bot_game", "won": True, "maxCombo": 5, "moves": 40},
        headers=bearer(tok),
    )
    assert r.status_code == 200, r.text
    q = {x["id"]: x for x in r.json()["quests"]}
    assert q["d_play3"]["progress"] == 1 and q["d_win1"]["progress"] == 1
    assert q["d_combo3"]["progress"] == 3
    r = await client.post(
        "/me/events",
        json={"type": "bot_game", "won": True, "maxCombo": 0, "moves": 5},
        headers=bearer(tok),
    )
    assert r.status_code == 422
    r = await client.post("/me/quests/d_win1/claim", headers=bearer(tok))
    assert r.status_code == 200 and r.json()["reward"] == {"lead": 15}
    assert r.json()["progress"]["wallet"]["lead"] == 15


# ---------- Avatar ----------


def png_bytes(w: int = 300, h: int = 200, color=(255, 0, 0)) -> bytes:
    im = Image.new("RGB", (w, h), color)
    out = io.BytesIO()
    im.save(out, format="PNG")
    return out.getvalue()


async def test_avatar_upload_serve_delete(client: AsyncClient) -> None:
    tok, uid = await verified_account(client)
    r = await client.post(
        "/me/avatar", files={"file": ("a.png", png_bytes(), "image/png")}, headers=bearer(tok)
    )
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["hasCustomAvatar"] is True
    assert u["avatarUrl"] == f"http://localhost:8000/avatars/{uid}/1.webp"
    r = await client.get(f"/avatars/{uid}/1.webp")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert "immutable" in r.headers["cache-control"]
    im = Image.open(io.BytesIO(r.content))
    assert im.size == (256, 256) and len(r.content) <= 120 * 1024
    # Tải lại → version tăng; xóa → về ảnh mặc định.
    r = await client.post(
        "/me/avatar", files={"file": ("b.png", png_bytes(50, 50), "image/png")}, headers=bearer(tok)
    )
    assert r.json()["avatarUrl"].endswith(f"/avatars/{uid}/2.webp")
    assert (await client.get(f"/avatars/{uid}/1.webp")).status_code == 404  # object cũ đã dọn
    r = await client.delete("/me/avatar", headers=bearer(tok))
    assert r.json()["hasCustomAvatar"] is False and r.json()["avatarUrl"] is None
    assert (await client.get(f"/avatars/{uid}/2.webp")).status_code == 404
    # Tải lại sau khi xóa → seq tiếp tục tăng (URL mới, không dính cache CDN của ảnh cũ).
    r = await client.post(
        "/me/avatar", files={"file": ("c.png", png_bytes(60, 60), "image/png")}, headers=bearer(tok)
    )
    assert r.json()["avatarUrl"].endswith(f"/avatars/{uid}/3.webp")


async def test_avatar_rejects_garbage_and_guest(client: AsyncClient) -> None:
    tok, _ = await verified_account(client)
    r = await client.post(
        "/me/avatar", files={"file": ("x.png", b"not an image", "image/png")}, headers=bearer(tok)
    )
    assert r.status_code == 422 and r.json()["code"] == "AVATAR_INVALID"
    client.cookies.clear()
    r = await client.post("/auth/guest", json={"deviceId": "device-0123456789abcdef"})
    g = r.json()["accessToken"]
    r = await client.post(
        "/me/avatar", files={"file": ("a.png", png_bytes(), "image/png")}, headers=bearer(g)
    )
    assert r.status_code == 403


async def test_avatar_public_bucket_url(monkeypatch) -> None:
    """Đặt S3_PUBLIC_URL → URL ảnh trỏ thẳng vào bucket, vẫn kèm ?v= để cache bất biến."""
    from app import storage
    from app.config import Settings
    from app.economy.router import avatar_url_for
    from app.models import User

    monkeypatch.setattr(
        storage, "get_settings", lambda: Settings(s3_public_url="https://minio.test/okia-bucket/")
    )
    uid = uuid.uuid4()
    u = User(id=uid, display_name="x", avatar_version=3)
    assert avatar_url_for(u) == f"https://minio.test/okia-bucket/avatars/{uid}/3.webp"
    u.avatar_version = 0
    u.avatar_url = "https://lh3.example/pic"
    assert avatar_url_for(u) == "https://lh3.example/pic"


async def test_avatar_storage_down_keeps_version(client: AsyncClient, monkeypatch) -> None:
    """Storage lỗi → 503 STORAGE_UNAVAILABLE, không tăng avatar_version."""
    from app import storage
    from app.errors import AppError

    class Broken:
        async def put(self, key: str, data: bytes, content_type: str) -> None:
            raise AppError("STORAGE_UNAVAILABLE", 503)

    tok, _ = await verified_account(client)
    monkeypatch.setattr(storage, "get_storage", lambda: Broken())
    r = await client.post(
        "/me/avatar", files={"file": ("a.png", png_bytes(), "image/png")}, headers=bearer(tok)
    )
    assert r.status_code == 503 and r.json()["code"] == "STORAGE_UNAVAILABLE"
    me = await client.get("/me", headers=bearer(tok))
    assert me.json()["hasCustomAvatar"] is False
