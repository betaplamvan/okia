"""Mùa giải, dòng rating, và chốt kết quả trận xếp hạng (docs/07, ADR-0012).

`settle()` chạy trong MỘT transaction cùng với dòng `matches`: cập nhật rating ẩn (Glicko-2),
điểm hạng hiển thị, thống kê, và cộng Ruột chì cho người thắng (docs/06). Caller commit.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.economy import wallet
from app.models import Match, Rating, Season, User
from app.rating import glicko2, points
from app.rating.points import PLACEMENT_GAMES, Rank, rank_of

SEASON_DAYS = 56  # 8 tuần (docs/07)
RANKED_WIN_LEAD = 30  # docs/06 — nguồn Ruột chì lặp lại duy nhất (mặc định; admin chỉnh được)


def ranked_win_lead() -> int:
    from app.admin import config as appconfig

    return appconfig.get_int("ranked_win_lead", RANKED_WIN_LEAD)


def rank_tuning() -> dict[str, int]:
    """Điểm hạng cơ bản thắng/thua và thưởng chuỗi (admin chỉnh được, mặc định trong points.py)."""
    from app.admin import config as appconfig

    return {
        "win_base": appconfig.get_int("rank_win_points", points.WIN_BASE),
        "loss_base": appconfig.get_int("rank_loss_points", points.LOSS_BASE),
        "streak_bonus": appconfig.get_int("rank_streak_bonus", points.STREAK_BONUS),
    }


def bot_stake() -> float:
    """Trận xếp hạng với máy: hệ số điểm so với trận cân với người."""
    from app.admin import config as appconfig

    return appconfig.get_int("rank_bot_stake_pct", points.BOT_STAKE_PCT) / 100.0


MIN_MOVES_FOR_REWARD = 10  # đầu hàng trước nước 10 → không thưởng
SOFT_RESET_RD = 150.0


# ---------- Mùa giải ----------


def season_name(n: int) -> dict[str, str]:
    return {"vi": f"Học kỳ {n}", "en": f"Semester {n}"}


async def current_season(db: AsyncSession, now: datetime | None = None) -> Season:
    """Mùa đang diễn ra; hết mùa (hoặc chưa có) thì tự mở mùa kế tiếp 8 tuần kể từ lúc này.
    Khóa advisory để hai request cùng lúc không mở hai mùa."""
    now = now or datetime.now(UTC)
    s = await _active_season(db, now)
    if s is not None:
        return s
    await db.execute(text("SELECT pg_advisory_xact_lock(7001)"))
    s = await _active_season(db, now)
    if s is not None:
        return s
    n = (await db.execute(select(func.count()).select_from(Season))).scalar_one() + 1
    s = Season(name=season_name(n), starts_at=now, ends_at=now + timedelta(days=SEASON_DAYS))
    db.add(s)
    await db.flush()
    return s


async def _active_season(db: AsyncSession, now: datetime) -> Season | None:
    res = await db.execute(
        select(Season)
        .where(Season.starts_at <= now, Season.ends_at > now)
        .order_by(Season.starts_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


# ---------- Dòng rating ----------


async def get_rating(db: AsyncSession, user_id: uuid.UUID, season_id: int) -> Rating | None:
    res = await db.execute(
        select(Rating).where(Rating.user_id == user_id, Rating.season_id == season_id)
    )
    return res.scalar_one_or_none()


async def get_or_create_rating(
    db: AsyncSession, user_id: uuid.UUID, season: Season, *, for_update: bool = False
) -> Rating:
    """Dòng rating của mùa này; chưa có thì tạo với reset mềm từ mùa gần nhất (docs/07):
    mmr = 1500 + (mmr cũ − 1500) × 0.5, rd = max(rd cũ, 150), điểm hạng = một nửa."""
    stmt = select(Rating).where(Rating.user_id == user_id, Rating.season_id == season.id)
    if for_update:
        stmt = stmt.with_for_update()
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row
    prev = (
        await db.execute(
            select(Rating)
            .where(Rating.user_id == user_id, Rating.season_id < season.id)
            .order_by(Rating.season_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    row = Rating(
        user_id=user_id,
        season_id=season.id,
        mmr=glicko2.DEFAULT_MMR + (prev.mmr - glicko2.DEFAULT_MMR) * 0.5 if prev else 1500.0,
        rd=max(prev.rd, SOFT_RESET_RD) if prev else glicko2.DEFAULT_RD,
        vol=prev.vol if prev else glicko2.DEFAULT_VOL,
        points=prev.points // 2 if prev else 0,
        peak_points=prev.points // 2 if prev else 0,
        games=0,
        wins=0,
        losses=0,
        streak=0,
        best_streak=0,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        # Request khác vừa tạo → đọc lại.
        row = (await db.execute(stmt)).scalar_one()
    return row


def visible_rank(r: Rating | None) -> Rank | None:
    """Hạng hiển thị: None khi còn trong 5 trận phân hạng (hoặc chưa chơi)."""
    if r is None or r.games < PLACEMENT_GAMES:
        return None
    return rank_of(r.points)


def placement_left(r: Rating | None) -> int:
    return max(0, PLACEMENT_GAMES - (r.games if r else 0))


async def titled_rank(db: AsyncSession, r: Rating | None) -> Rank | None:
    """Hạng hiển thị kèm danh hiệu Trạng nguyên (Thủ khoa trong top 100 BXH). Chỉ truy vấn vị trí
    khi là Thủ khoa."""
    rank = visible_rank(r)
    if rank is None or rank.tier != "valedictorian" or r is None:
        return rank
    return points.with_top_title(rank, await position_of(db, r))


# ---------- Chốt trận ----------


@dataclass
class Settled:
    match_id: uuid.UUID
    points: list[int]
    points_delta: list[int]
    ranks: list[Rank | None]
    rewards: list[dict[str, int]]
    placement_left: list[int]


def reward_eligible(reason: str, moves: int) -> bool:
    """docs/06: không thưởng khi afk hoặc đầu hàng trước nước 10."""
    if reason == "afk":
        return False
    return reason == "complete" or moves >= MIN_MOVES_FOR_REWARD


async def settle(
    db: AsyncSession,
    *,
    match_id: uuid.UUID,
    board: str,
    user_ids: list[uuid.UUID],
    winner: int | None,
    reason: str,
    moves: list[dict[str, object]],
    scores: list[int],
    started_at: datetime,
    now: datetime | None = None,
) -> Settled:
    """Cập nhật rating hai ghế + ghi `matches` + thưởng. Không commit."""
    now = now or datetime.now(UTC)
    season = await current_season(db, now)
    # Khóa theo thứ tự user_id cố định để hai trận chốt cùng lúc không deadlock.
    order = sorted(range(2), key=lambda i: str(user_ids[i]))
    rows: dict[int, Rating] = {}
    for i in order:
        rows[i] = await get_or_create_rating(db, user_ids[i], season, for_update=True)
    r0, r1 = rows[0], rows[1]
    g0 = _current(r0, now)
    g1 = _current(r1, now)
    s0 = 0.5 if winner is None else (1.0 if winner == 0 else 0.0)
    s1 = 1.0 - s0
    gap = g0.mmr - g1.mmr
    tun = rank_tuning()
    d0 = points.delta(glicko2.expected(g0, g1), s0, gap, points=r0.points, streak=r0.streak, **tun)
    d1 = points.delta(glicko2.expected(g1, g0), s1, gap, points=r1.points, streak=r1.streak, **tun)
    n0 = glicko2.update(g0, [(g1, s0)])
    n1 = glicko2.update(g1, [(g0, s1)])
    _apply(r0, n0, d0, s0, now)
    _apply(r1, n1, d1, s1, now)

    rewards: list[dict[str, int]] = [{}, {}]
    win_lead = ranked_win_lead()
    if winner is not None and reward_eligible(reason, len(moves)) and win_lead > 0:
        await wallet.credit(
            db,
            user_ids[winner],
            "lead",
            win_lead,
            source="match",
            ref=str(match_id),
            idempotency_key=f"match:{match_id}:{user_ids[winner]}",
        )
        rewards[winner] = {"lead": win_lead}

    db.add(
        Match(
            id=match_id,
            mode="ranked",
            board=board,
            season_id=season.id,
            player0=user_ids[0],
            player1=user_ids[1],
            moves=moves,
            scores=scores,
            winner=winner,
            end_reason=reason,
            rating_delta=[n0.mmr - g0.mmr, n1.mmr - g1.mmr],
            points_delta=[d0, d1],
            started_at=started_at,
            ended_at=now,
        )
    )
    await db.flush()
    return Settled(
        match_id=match_id,
        points=[r0.points, r1.points],
        points_delta=[d0, d1],
        ranks=[await titled_rank(db, r0), await titled_rank(db, r1)],
        rewards=rewards,
        placement_left=[placement_left(r0), placement_left(r1)],
    )


async def settle_vs_bot(
    db: AsyncSession,
    *,
    match_id: uuid.UUID,
    board: str,
    user_id: uuid.UUID,
    seat: int,
    bot_strength: float,
    winner: int | None,
    reason: str,
    moves: list[dict[str, object]],
    scores: list[int],
    started_at: datetime,
    now: datetime | None = None,
) -> Settled:
    """Trận xếp hạng với máy (docs/07): điểm hạng như trận cân với người nhân `bot_stake()` (mặc
    định 75 %; vẫn có hệ số hạng và thưởng chuỗi), thống kê và thưởng như thường, **rating ẩn
    không đổi** (máy không có rating để ước lượng). Ghế của máy trong các
    danh sách trả về là 0 / None. Không commit."""
    now = now or datetime.now(UTC)
    season = await current_season(db, now)
    r = await get_or_create_rating(db, user_id, season, for_update=True)
    s = 0.5 if winner is None else (1.0 if winner == seat else 0.0)
    d = points.delta(
        0.5, s, 0.0, points=r.points, streak=r.streak, mult=bot_stake(), **rank_tuning()
    )
    _apply_points(r, d, s, now)

    rewards: list[dict[str, int]] = [{}, {}]
    win_lead = ranked_win_lead()
    if winner == seat and reward_eligible(reason, len(moves)) and win_lead > 0:
        await wallet.credit(
            db,
            user_id,
            "lead",
            win_lead,
            source="match",
            ref=str(match_id),
            idempotency_key=f"match:{match_id}:{user_id}",
        )
        rewards[seat] = {"lead": win_lead}

    by_seat = lambda mine, other: [mine, other] if seat == 0 else [other, mine]  # noqa: E731
    db.add(
        Match(
            id=match_id,
            mode="ranked",
            board=board,
            season_id=season.id,
            player0=user_id if seat == 0 else None,
            player1=user_id if seat == 1 else None,
            bot_strength=bot_strength,
            moves=moves,
            scores=scores,
            winner=winner,
            end_reason=reason,
            rating_delta=[0.0, 0.0],
            points_delta=by_seat(d, 0),
            started_at=started_at,
            ended_at=now,
        )
    )
    await db.flush()
    return Settled(
        match_id=match_id,
        points=by_seat(r.points, 0),
        points_delta=by_seat(d, 0),
        ranks=by_seat(await titled_rank(db, r), None),
        rewards=rewards,
        placement_left=by_seat(placement_left(r), 0),
    )


def _current(r: Rating, now: datetime) -> glicko2.Glicko:
    g = glicko2.Glicko(r.mmr, r.rd, r.vol)
    if r.last_played_at is None:
        return g
    idle_days = max(0.0, (now - r.last_played_at).total_seconds() / 86400.0)
    return glicko2.inflate(g, idle_days)


def _apply(r: Rating, g: glicko2.Glicko, d: int, score: float, now: datetime) -> None:
    r.mmr, r.rd, r.vol = g.mmr, g.rd, g.vol
    _apply_points(r, d, score, now)


def _apply_points(r: Rating, d: int, score: float, now: datetime) -> None:
    """Điểm hạng + thống kê (không đụng rating ẩn)."""
    r.points = points.apply(r.points, d)
    r.peak_points = max(r.peak_points, r.points)
    r.games += 1
    if score >= 1.0:
        r.wins += 1
        r.streak += 1
        r.best_streak = max(r.best_streak, r.streak)
    elif score <= 0.0:
        r.losses += 1
        r.streak = 0
    else:
        r.streak = 0
    if r.games >= PLACEMENT_GAMES:
        tier = rank_of(r.points).tier
        if r.peak_tier is None or points.tier_floor(tier) > points.tier_floor(r.peak_tier):
            r.peak_tier = tier
    r.last_played_at = now


# ---------- Truy vấn cho REST ----------


@dataclass
class LeaderboardRow:
    position: int
    user: User
    rating: Rating


async def leaderboard(db: AsyncSession, season_id: int, limit: int = 100) -> list[LeaderboardRow]:
    res = await db.execute(
        select(Rating, User)
        .join(User, User.id == Rating.user_id)
        .where(
            Rating.season_id == season_id,
            Rating.games >= PLACEMENT_GAMES,
            User.deleted_at.is_(None),
        )
        .order_by(Rating.points.desc(), Rating.mmr.desc(), Rating.wins.desc(), Rating.user_id)
        .limit(limit)
    )
    return [LeaderboardRow(i + 1, u, r) for i, (r, u) in enumerate(res.all())]


async def position_of(db: AsyncSession, r: Rating) -> int | None:
    """Thứ hạng trên BXH (1 = đầu); None khi chưa qua phân hạng."""
    if r.games < PLACEMENT_GAMES:
        return None
    n = await db.execute(
        select(func.count())
        .select_from(Rating)
        .join(User, User.id == Rating.user_id)
        .where(
            Rating.season_id == r.season_id,
            Rating.games >= PLACEMENT_GAMES,
            User.deleted_at.is_(None),
            (Rating.points > r.points) | ((Rating.points == r.points) & (Rating.mmr > r.mmr)),
        )
    )
    return n.scalar_one() + 1


@dataclass
class HistoryRow:
    match: Match
    seat: int
    opponent: User | None


async def history(
    db: AsyncSession, user_id: uuid.UUID, season_id: int, limit: int = 10
) -> list[HistoryRow]:
    res = await db.execute(
        select(Match)
        .where(
            Match.mode == "ranked",
            Match.season_id == season_id,
            (Match.player0 == user_id) | (Match.player1 == user_id),
        )
        .order_by(Match.ended_at.desc())
        .limit(limit)
    )
    matches = list(res.scalars())
    opp_ids = {(m.player1 if m.player0 == user_id else m.player0) for m in matches} - {None}
    users: dict[uuid.UUID, User] = {}
    if opp_ids:
        ures = await db.execute(select(User).where(User.id.in_(list(opp_ids))))
        users = {u.id: u for u in ures.scalars()}
    rows = []
    for m in matches:
        seat = 0 if m.player0 == user_id else 1
        opp_id = m.player1 if seat == 0 else m.player0
        rows.append(HistoryRow(m, seat, users.get(opp_id) if opp_id else None))
    return rows
