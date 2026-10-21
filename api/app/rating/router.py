"""REST xếp hạng (docs/07, P2-09): mùa hiện tại, bảng xếp hạng (cache Redis), hạng + lịch sử
của tôi."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, get_redis, optional_user
from app.auth.schemas import CamelModel
from app.db import get_db
from app.economy.router import avatar_url_for
from app.models import Season, User
from app.rating import service
from app.rating.points import PLACEMENT_GAMES, Rank

router = APIRouter(tags=["ranked"])
Db = Annotated[AsyncSession, Depends(get_db)]
Rd = Annotated[Redis, Depends(get_redis)]

LEADERBOARD_LIMIT = 100
LEADERBOARD_CACHE_SECONDS = 30


# ---------- Schema ----------


class SeasonOut(CamelModel):
    id: int
    name: dict[str, str]
    starts_at: datetime
    ends_at: datetime


class RankOut(CamelModel):
    tier: str
    division: int | None
    points: int


class LeaderboardEntry(CamelModel):
    position: int
    user_id: uuid.UUID
    name: str
    avatar_url: str | None
    rank: RankOut
    games: int
    wins: int


class LeaderboardOut(CamelModel):
    season: SeasonOut
    placement_games: int = PLACEMENT_GAMES
    entries: list[LeaderboardEntry]
    me: LeaderboardEntry | None = None


class HistoryOut(CamelModel):
    id: uuid.UUID
    opponent_name: str | None
    opponent_avatar_url: str | None
    won: bool | None  # None = hòa
    scores: list[int]  # [tôi, đối thủ]
    points_delta: int
    reason: Literal["complete", "resign", "afk", "abandon"]
    ended_at: datetime


class MyRankOut(CamelModel):
    season: SeasonOut
    eligible: bool  # tài khoản thật đã xác minh (khách: chỉ xem)
    rank: RankOut | None  # None khi còn phân hạng
    points: int
    peak_points: int
    games: int
    wins: int
    losses: int
    streak: int
    best_streak: int
    placement_games: int = PLACEMENT_GAMES
    placement_left: int
    position: int | None
    history: list[HistoryOut]


# ---------- Tiện ích ----------


def season_out(s: Season) -> SeasonOut:
    return SeasonOut(id=s.id, name=s.name, starts_at=s.starts_at, ends_at=s.ends_at)


def rank_out(r: Rank) -> RankOut:
    return RankOut(tier=r.tier, division=r.division, points=r.points)


def entry_out(row: service.LeaderboardRow) -> LeaderboardEntry:
    return LeaderboardEntry(
        position=row.position,
        user_id=row.user.id,
        name=row.user.display_name,
        avatar_url=avatar_url_for(row.user),
        rank=rank_out(service.visible_rank(row.rating) or Rank("scratch", 3, row.rating.points)),
        games=row.rating.games,
        wins=row.rating.wins,
    )


# ---------- Endpoint ----------


@router.get("/seasons/current", response_model=SeasonOut)
async def season_current(db: Db) -> SeasonOut:
    s = await service.current_season(db)
    await db.commit()
    return season_out(s)


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(
    db: Db,
    redis: Rd,
    user: Annotated[User | None, Depends(optional_user)],
    limit: Annotated[int, Query(ge=1, le=LEADERBOARD_LIMIT)] = LEADERBOARD_LIMIT,
) -> LeaderboardOut:
    s = await service.current_season(db)
    await db.commit()
    cache_key = f"lb:{s.id}"
    cached = await redis.get(cache_key)
    if cached:
        entries = [LeaderboardEntry.model_validate(e) for e in json.loads(cached)]
    else:
        rows = await service.leaderboard(db, s.id, LEADERBOARD_LIMIT)
        entries = [entry_out(r) for r in rows]
        await redis.set(
            cache_key,
            json.dumps([e.model_dump(mode="json", by_alias=True) for e in entries]),
            ex=LEADERBOARD_CACHE_SECONDS,
        )
    me: LeaderboardEntry | None = None
    if user is not None and not user.is_guest:
        r = await service.get_rating(db, user.id, s.id)
        if r is not None and r.games >= PLACEMENT_GAMES:
            pos = await service.position_of(db, r)
            me = entry_out(service.LeaderboardRow(pos or 0, user, r))
    return LeaderboardOut(season=season_out(s), entries=entries[:limit], me=me)


@router.get("/me/rank", response_model=MyRankOut, tags=["me"])
async def me_rank(db: Db, user: Annotated[User, Depends(current_user)]) -> MyRankOut:
    s = await service.current_season(db)
    r = await service.get_rating(db, user.id, s.id)
    await db.commit()
    rank = service.visible_rank(r)
    hist = await service.history(db, user.id, s.id) if r else []
    return MyRankOut(
        season=season_out(s),
        eligible=(not user.is_guest) and user.email_verified_at is not None,
        rank=rank_out(rank) if rank else None,
        points=r.points if r else 0,
        peak_points=r.peak_points if r else 0,
        games=r.games if r else 0,
        wins=r.wins if r else 0,
        losses=r.losses if r else 0,
        streak=r.streak if r else 0,
        best_streak=r.best_streak if r else 0,
        placement_left=service.placement_left(r),
        position=await service.position_of(db, r) if r else None,
        history=[
            HistoryOut(
                id=h.match.id,
                opponent_name=h.opponent.display_name if h.opponent else None,
                opponent_avatar_url=avatar_url_for(h.opponent) if h.opponent else None,
                won=None if h.match.winner is None else h.match.winner == h.seat,
                scores=[h.match.scores[h.seat], h.match.scores[1 - h.seat]],
                points_delta=(h.match.points_delta or [0, 0])[h.seat],
                reason=h.match.end_reason,  # type: ignore[arg-type]
                ended_at=h.match.ended_at,
            )
            for h in hist
        ],
    )
