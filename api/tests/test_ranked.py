"""Xếp hạng & ghép trận (docs/07, ADR-0012): điểm hạng theo tiền cược, hàng chờ, worker ghép,
chốt trận trong một transaction (rating + matches + Ruột chì), BXH, hạng của tôi, mùa mới
reset mềm."""

import asyncio
import json
import math
import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import asyncpg
import pytest
import redis.asyncio as aioredis
from sqlalchemy import select
from starlette.testclient import TestClient, WebSocketTestSession

from app.db import dispose_engine, get_session_factory
from app.economy import wallet
from app.matchmaking import queue as q
from app.models import Season
from app.rating import glicko2, points, service
from app.rating.points import PLACEMENT_GAMES, rank_of

pytestmark = pytest.mark.usefixtures("_clean")

# ---------- Đơn vị: điểm hạng ----------


def test_rank_of_theo_diem() -> None:
    assert rank_of(0) == points.Rank("scratch", 3, 0)
    assert rank_of(99).division == 3
    assert rank_of(100).division == 2
    assert rank_of(299) == points.Rank("scratch", 1, 299)
    assert rank_of(300).tier == "notebook"
    assert rank_of(650) == points.Rank("good", 3, 650)
    assert rank_of(750).division == 2
    assert rank_of(1199) == points.Rank("honor", 1, 1199)
    assert rank_of(1200) == points.Rank("valedictorian", None, 1200)
    assert rank_of(5000).tier == "valedictorian"


def test_delta_tran_can_va_tran_lech() -> None:
    # Cân 50/50: thắng +24, thua −16.
    assert points.delta(0.5, 1.0, 0) == 24
    assert points.delta(0.5, 0.0, 0) == -16
    # Chênh ít (≤150) vẫn cược đủ.
    assert points.stake(150) == 1.0
    # Lệch nhiều (≥500): cược chỉ còn 10% → kẻ mạnh thắng chỉ +1, kẻ yếu thua chỉ −1.
    strong, weak = glicko2.Glicko(2000, 50), glicko2.Glicko(1500, 50)
    e_strong = glicko2.expected(strong, weak)
    assert e_strong > 0.9
    assert points.delta(e_strong, 1.0, 500) == 1
    assert points.delta(1 - e_strong, 0.0, 500) == -1
    # Kẻ yếu thắng ngược vẫn được nhiều hơn kẻ mạnh thua mất (cược giảm cho cả hai).
    assert points.delta(1 - e_strong, 1.0, 500) > 1
    assert -5 <= points.delta(e_strong, 0.0, 500) <= -1
    # Không bao giờ âm.
    assert points.apply(5, -16) == 0


# ---------- Đơn vị: hàng chờ ----------


def _entry(uid: str, mmr: float, waited_s: float, now: int, last: str | None = None) -> q.Entry:
    return q.Entry(uid, uid, mmr, 350, now - int(waited_s * 1000), last_opponent=last)


def test_cua_so_noi_dan_theo_thoi_gian_cho() -> None:
    assert q.window(0) == 50
    assert q.window(4.9) == 50
    assert q.window(5) == 75
    assert q.window(70) == 400
    assert q.window(89) == 400
    assert q.window(90) == math.inf


def test_pair_up_gan_nhat_trong_ca_hai_cua_so() -> None:
    now = q.now_ms()
    a = _entry("a", 1500, 0, now)
    b = _entry("b", 1540, 0, now)  # chênh 40 ≤ 50
    c = _entry("c", 1510, 0, now)  # gần a nhất
    d = _entry("d", 1800, 0, now)  # xa, không ai ghép
    pairs = q.pair_up([a, b, c, d], now)
    assert {(x.user_id, y.user_id) for x, y in pairs} == {("a", "c")}
    # Chờ lâu → cửa sổ mở, nhưng cửa sổ của NGƯỜI KIA cũng phải chứa chênh lệch.
    a2 = _entry("a", 1500, 60, now)  # cửa sổ 350
    assert q.pair_up([a2, d], now) == []  # d mới vào, cửa sổ 50
    d2 = _entry("d", 1800, 60, now)
    assert [(x.user_id, y.user_id) for x, y in q.pair_up([a2, d2], now)] == [("a", "d")]
    # Vắng người: sau 90 giây ghép bất kỳ ai.
    far = _entry("z", 2500, 95, now)
    a3 = _entry("a", 1500, 95, now)
    assert len(q.pair_up([a3, far], now)) == 1


def test_pair_up_khong_ghep_lai_doi_thu_vua_gap() -> None:
    now = q.now_ms()
    a = _entry("a", 1500, 10, now, last="b")
    b = _entry("b", 1500, 10, now, last="a")
    assert q.pair_up([a, b], now) == []
    # Chờ > 60 giây thì chấp nhận gặp lại.
    a2 = _entry("a", 1500, 61, now, last="b")
    b2 = _entry("b", 1500, 61, now, last="a")
    assert len(q.pair_up([a2, b2], now)) == 1


# ---------- Tích hợp WS ----------

_open: list[WebSocketTestSession] = []


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c
        for ws in _open:
            try:
                ws.__exit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass
        _open.clear()


def account(c: TestClient, email: str) -> tuple[str, str]:
    r = c.post("/auth/dev-login", json={"email": email, "displayName": email.split("@")[0]})
    assert r.status_code == 200, r.text
    c.cookies.clear()
    return r.json()["accessToken"], r.json()["user"]["id"]


def guest(c: TestClient, device: str) -> str:
    r = c.post("/auth/guest", json={"deviceId": device})
    assert r.status_code == 200, r.text
    c.cookies.clear()
    return r.json()["accessToken"]


def recv(ws: WebSocketTestSession, t: str | None = None) -> dict[str, Any]:
    for _ in range(40):
        msg = json.loads(ws.receive_text())
        if t is None or msg["t"] == t:
            return msg
    raise AssertionError(f"không nhận được {t}")


def send(ws: WebSocketTestSession, **msg: Any) -> None:
    ws.send_text(json.dumps(msg))


def open_ws(c: TestClient, token: str) -> WebSocketTestSession:
    ws = c.websocket_connect(f"/ws?token={token}")
    ws.__enter__()
    _open.append(ws)
    recv(ws, "welcome")
    return ws


def bearer(tok: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


def play_to_end(socks: dict[int, WebSocketTestSession], code: str, state: dict[str, Any]) -> dict:
    """Mỗi lượt người có lượt vẽ cạnh trống đầu tiên cho tới khi hết bàn; trả `game_over`."""
    turn = state["turn"]
    edges = list(state["edges"])
    move_no = state["moveNo"]
    while True:
        edge = edges.index(-1)
        send(socks[turn], t="move", roomId=code, edge=edge, seq=move_no)
        mv = recv(socks[turn], "moved")
        assert recv(socks[1 - turn], "moved") == mv
        edges[edge] = turn
        move_no, turn = mv["moveNo"], mv["turn"]
        if -1 not in edges:
            over = recv(socks[0], "game_over")
            assert recv(socks[1], "game_over") == over
            return over


def test_ghep_tran_va_chot_ket_qua(client: TestClient) -> None:
    ta, ua = account(client, "an@example.com")
    tb, ub = account(client, "binh@example.com")
    a = open_ws(client, ta)
    b = open_ws(client, tb)

    # Chưa có hạng: /me/rank trả phân hạng còn 5 trận, chưa có vị trí.
    r = client.get("/me/rank", headers=bearer(ta))
    assert r.status_code == 200
    me = r.json()
    assert me["eligible"] and me["rank"] is None and me["placementLeft"] == PLACEMENT_GAMES
    assert me["season"]["name"]["vi"] == "Học kỳ 1"

    send(a, t="queue", mode="ranked")
    qa = recv(a, "queued")
    assert qa["mode"] == "ranked" and qa["board"] == "random"
    # Gửi lại không reset thời điểm vào.
    send(a, t="queue", mode="ranked")
    assert recv(a, "queued")["since"] == qa["since"]
    send(b, t="queue", mode="ranked")
    recv(b, "queued")

    # Worker nền ghép trong ~1 giây → cả hai nhận matched cùng roomId.
    ma = recv(a, "matched")
    mb = recv(b, "matched")
    assert ma["roomId"] == mb["roomId"] and ma["mode"] == "ranked"
    code = ma["roomId"]

    send(a, t="room_join", roomId=code)
    send(b, t="room_join", roomId=code)
    sa = recv(a, "room_state")
    recv(b, "room_state")
    assert sa["mode"] == "ranked" and sa["status"] == "playing" and sa["turnSeconds"] == 30
    assert all(p["rank"] is None for p in sa["players"])  # còn phân hạng
    assert {p["seat"] for p in sa["players"]} == {0, 1}
    # Đang dở trận → không vào hàng chờ được.
    send(a, t="queue", mode="ranked")
    assert recv(a, "error")["code"] == "ALREADY_IN_GAME"

    seat_of = {p["userId"]: p["seat"] for p in sa["players"]}
    socks = {seat_of[ua]: a, seat_of[ub]: b}
    over = play_to_end(socks, code, sa["state"])
    assert over["reason"] == "complete" and over["winner"] in (0, 1)
    rk = over["ranked"]
    assert rk is not None
    w = over["winner"]
    # Trận cân (cả hai 1500/350): thắng +24, thua −16 nhưng không âm → 0.
    assert rk["pointsDelta"][w] == 24 and rk["pointsDelta"][1 - w] == -16
    assert rk["points"][w] == 24 and rk["points"][1 - w] == 0
    assert rk["rewards"][w] == {"lead": 30} and rk["rewards"][1 - w] == {}
    assert rk["placementLeft"] == [PLACEMENT_GAMES - 1] * 2
    assert rk["ranks"] == [None, None]

    # /me: ví người thắng có 30 Ruột chì; /me/rank có lịch sử + delta.
    tok_w = ta if seat_of[ua] == w else tb
    tok_l = tb if tok_w == ta else ta
    assert client.get("/me", headers=bearer(tok_w)).json()["wallet"]["lead"] == 30
    assert client.get("/me", headers=bearer(tok_l)).json()["wallet"]["lead"] == 0
    mw = client.get("/me/rank", headers=bearer(tok_w)).json()
    assert mw["games"] == 1 and mw["wins"] == 1 and mw["points"] == 24 and mw["streak"] == 1
    assert mw["placementLeft"] == PLACEMENT_GAMES - 1 and mw["position"] is None
    assert len(mw["history"]) == 1
    h = mw["history"][0]
    assert h["won"] is True and h["pointsDelta"] == 24 and h["reason"] == "complete"
    assert h["opponentName"] in ("an", "binh")
    # BXH: chưa ai qua phân hạng → trống.
    lb = client.get("/leaderboard").json()
    assert lb["entries"] == [] and lb["me"] is None

    async def check_db() -> None:
        # Engine của app gắn với event loop của server → đọc thẳng bằng asyncpg.
        conn = await asyncpg.connect(
            os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
        )
        try:
            m = await conn.fetchrow("SELECT * FROM matches")
            assert m["mode"] == "ranked" and m["season_id"] is not None
            assert sorted(m["points_delta"]) == [-16, 24]
            assert m["rating_delta"][w] > 0 > m["rating_delta"][1 - w]
            rows = await conn.fetch("SELECT * FROM ratings")
            assert len(rows) == 2 and all(r["games"] == 1 for r in rows)
            assert {round(r["mmr"]) for r in rows} != {1500}
        finally:
            await conn.close()

    asyncio.run(check_db())


def test_khach_va_casual_bi_tu_choi_cancel_va_rot_mang_roi_hang_cho(client: TestClient) -> None:
    g = open_ws(client, guest(client, "device-guest-0123456789"))
    send(g, t="queue", mode="ranked")
    assert recv(g, "error")["code"] == "GUEST_NOT_ALLOWED"
    ta, ua = account(client, "an@example.com")
    a = open_ws(client, ta)
    send(a, t="queue", mode="casual")
    assert recv(a, "error")["code"] == "UNSUPPORTED"

    async def in_queue(uid: str) -> bool:
        r = aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        try:
            return await q.in_queue(r, uid)
        finally:
            await r.aclose()

    send(a, t="queue", mode="ranked")
    recv(a, "queued")
    assert asyncio.run(in_queue(ua))
    # Một mình thì nhận queue_status (số người chờ / online) chứ không matched.
    st = recv(a, "queue_status")
    assert st["waiting"] == 1 and st["online"] >= 1 and st["widened"] is False
    send(a, t="queue_cancel")
    for _ in range(20):
        if not asyncio.run(in_queue(ua)):
            break
        asyncio.run(asyncio.sleep(0.05))
    assert not asyncio.run(in_queue(ua))
    # Rớt mạng khi đang chờ → tự rời hàng chờ.
    send(a, t="queue", mode="ranked")
    recv(a, "queued")
    a.__exit__(None, None, None)
    _open.remove(a)
    for _ in range(40):
        if not asyncio.run(in_queue(ua)):
            break
        asyncio.run(asyncio.sleep(0.05))
    assert not asyncio.run(in_queue(ua))


# ---------- Service: chốt trận lệch, mùa mới, BXH ----------


async def _seed_user(db, email: str) -> uuid.UUID:
    from app.models import User

    u = User(display_name=email.split("@")[0], is_guest=False, email=email, locale="vi")
    u.email_verified_at = datetime.now(UTC)
    db.add(u)
    await db.flush()
    return u.id


async def test_settle_tran_lech_cuoc_nho_va_khong_thuong_khi_afk() -> None:
    async with get_session_factory()() as db:
        s = await service.current_season(db)
        strong = await _seed_user(db, "strong@example.com")
        weak = await _seed_user(db, "weak@example.com")
        rs = await service.get_or_create_rating(db, strong, s)
        rs.mmr, rs.rd = 2100.0, 60.0
        rw = await service.get_or_create_rating(db, weak, s)
        rw.mmr, rw.rd = 1500.0, 60.0
        rw.points = 200
        await db.flush()
        now = datetime.now(UTC)
        st = await service.settle(
            db,
            match_id=uuid.uuid4(),
            board="5x5",
            user_ids=[strong, weak],
            winner=0,
            reason="afk",
            moves=[{"by": 0, "edge": 0, "t": 0, "reason": "player"}] * 30,
            scores=[13, 12],
            started_at=now - timedelta(minutes=3),
            now=now,
        )
        await db.commit()
        # Lệch 600 → cược 10%: mạnh thắng +1, yếu thua −1; afk → không ai nhận Ruột chì.
        assert st.points_delta == [1, -1]
        assert st.points == [1, 199]
        assert st.rewards == [{}, {}]
        assert await wallet.balances(db, strong) == {"lead": 0, "flower": 0}
        # Đầu hàng sau nước 10 vẫn có thưởng; trước nước 10 thì không.
        assert service.reward_eligible("resign", 10) and not service.reward_eligible("resign", 9)
        assert service.reward_eligible("complete", 0) and not service.reward_eligible("afk", 99)
    await dispose_engine()


async def test_trang_nguyen_top_100_thu_khoa() -> None:
    """Thủ khoa (≥ 1200 điểm) trong top 100 BXH mang danh hiệu Trạng nguyên; ngoài top thì vẫn
    là Thủ khoa; dưới 1200 không bao giờ có danh hiệu."""
    from app.rating.points import TOP_TITLE, rank_of, with_top_title

    assert with_top_title(rank_of(1300), 1).tier == TOP_TITLE  # type: ignore[union-attr]
    assert with_top_title(rank_of(1300), 100).tier == TOP_TITLE  # type: ignore[union-attr]
    assert with_top_title(rank_of(1300), 101).tier == "valedictorian"  # type: ignore[union-attr]
    assert with_top_title(rank_of(1199), 1).tier == "honor"  # type: ignore[union-attr]
    assert with_top_title(None, 1) is None
    async with get_session_factory()() as db:
        s = await service.current_season(db)
        uid = await _seed_user(db, "top@example.com")
        r = await service.get_or_create_rating(db, uid, s)
        r.points, r.games, r.mmr = 1250, PLACEMENT_GAMES, 2000.0
        await db.commit()
        titled = await service.titled_rank(db, r)
        assert titled is not None and titled.tier == TOP_TITLE and titled.points == 1250
    await dispose_engine()


async def test_mua_moi_reset_mem_va_bxh() -> None:
    async with get_session_factory()() as db:
        s1 = await service.current_season(db)
        ids = [await _seed_user(db, f"p{i}@example.com") for i in range(3)]
        for i, uid in enumerate(ids):
            r = await service.get_or_create_rating(db, uid, s1)
            r.mmr, r.rd, r.points = 1700.0 + i * 10, 80.0, 400 + i * 50
            r.games, r.wins = PLACEMENT_GAMES + i, i
        # Người chưa qua phân hạng không lên BXH.
        newbie = await _seed_user(db, "newbie@example.com")
        rn = await service.get_or_create_rating(db, newbie, s1)
        rn.points, rn.games = 9999, PLACEMENT_GAMES - 1
        await db.commit()

        rows = await service.leaderboard(db, s1.id)
        assert [r.user.id for r in rows] == list(reversed(ids))
        assert [r.position for r in rows] == [1, 2, 3]
        assert await service.position_of(db, rn) is None
        r0 = await service.get_rating(db, ids[0], s1.id)
        assert r0 is not None and await service.position_of(db, r0) == 3

        # Kết thúc mùa 1 → current_season mở mùa 2; dòng rating mới reset mềm từ mùa 1.
        s1.ends_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
        s2 = await service.current_season(db)
        assert s2.id != s1.id and s2.name == {"vi": "Học kỳ 2", "en": "Semester 2"}
        r2 = await service.get_or_create_rating(db, ids[2], s2)
        await db.commit()
        assert math.isclose(r2.mmr, 1500 + (1720 - 1500) * 0.5)
        assert r2.rd == 150.0 and r2.points == 250 and r2.games == 0
        assert (await db.execute(select(Season))).scalars().all().__len__() == 2
    await dispose_engine()
