"""Nhiệm vụ ngày / tuần (ADR-0010). Danh mục cố định trong code, tên/mô tả qua catalog i18n
(`quests.<id>.name` / `.desc`), tiến trình trong bảng `quest_progress` theo kỳ.

Sự kiện (`Event`) phát ra từ kết thúc ván (server với phòng online, client báo với ván bot):
- game: ván hoàn tất (value = 1)
- win: thắng (bot hoặc online)
- win_online: thắng phòng online
- combo: combo lớn nhất trong ván (value = n; tiến trình = max)
- daily_claimed: nhận thưởng một nhiệm vụ ngày (nuôi nhiệm vụ tuần)
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.economy import periods, wallet
from app.errors import AppError
from app.models import QuestProgress

Event = Literal["game", "win", "win_online", "combo", "daily_claimed"]
Scope = Literal["daily", "weekly"]


@dataclass(frozen=True)
class Quest:
    id: str
    scope: Scope
    event: Event
    target: int
    reward: dict[str, int]
    mode: Literal["sum", "max"] = "sum"


CATALOG: tuple[Quest, ...] = (
    Quest("d_play3", "daily", "game", 3, {"lead": 10}),
    Quest("d_win1", "daily", "win", 1, {"lead": 15}),
    Quest("d_combo3", "daily", "combo", 3, {"lead": 10}, mode="max"),
    Quest("w_play15", "weekly", "game", 15, {"lead": 30, "flower": 1}),
    Quest("w_win_online3", "weekly", "win_online", 3, {"lead": 50}),
    Quest("w_daily5", "weekly", "daily_claimed", 5, {"flower": 1}),
)
BY_ID = {q.id: q for q in CATALOG}


def period_key(scope: Scope, now: datetime | None = None) -> str:
    return periods.daily_key(now) if scope == "daily" else periods.weekly_key(now)


async def record(
    db: AsyncSession, user_id: uuid.UUID, event: Event, value: int = 1, now: datetime | None = None
) -> None:
    """Cộng tiến trình cho mọi nhiệm vụ nghe `event` trong kỳ hiện tại (upsert, không commit)."""
    if value <= 0:
        return
    for q in CATALOG:
        if q.event != event:
            continue
        key = period_key(q.scope, now)
        stmt = insert(QuestProgress).values(
            user_id=user_id, quest_id=q.id, period=key, progress=value
        )
        if q.mode == "max":
            new_val = stmt.excluded.progress
            update = {
                "progress": func.greatest(QuestProgress.progress, new_val),
                "updated_at": datetime.now(UTC),
            }
        else:
            update = {
                "progress": QuestProgress.progress + stmt.excluded.progress,
                "updated_at": datetime.now(UTC),
            }
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=["user_id", "quest_id", "period"], set_=update
            )
        )


async def record_game(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    won: bool,
    online: bool,
    max_combo: int,
    now: datetime | None = None,
) -> None:
    await record(db, user_id, "game", 1, now)
    if won:
        await record(db, user_id, "win", 1, now)
        if online:
            await record(db, user_id, "win_online", 1, now)
    if max_combo > 0:
        await record(db, user_id, "combo", max_combo, now)


@dataclass
class QuestView:
    id: str
    scope: Scope
    target: int
    progress: int
    reward: dict[str, int]
    claimed: bool
    period: str


async def snapshot(
    db: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> tuple[list[QuestView], int, int]:
    """→ (danh sách nhiệm vụ của kỳ hiện tại, reset ngày (ms), reset tuần (ms))."""
    keys = {"daily": period_key("daily", now), "weekly": period_key("weekly", now)}
    res = await db.execute(
        select(QuestProgress).where(
            QuestProgress.user_id == user_id, QuestProgress.period.in_(list(keys.values()))
        )
    )
    rows = {(r.quest_id, r.period): r for r in res.scalars()}
    views = []
    for q in CATALOG:
        r = rows.get((q.id, keys[q.scope]))
        views.append(
            QuestView(
                id=q.id,
                scope=q.scope,
                target=q.target,
                progress=min(q.target, r.progress if r else 0),
                reward=q.reward,
                claimed=bool(r and r.claimed_at),
                period=keys[q.scope],
            )
        )
    return (
        views,
        periods.epoch_ms(periods.next_daily_reset(now)),
        periods.epoch_ms(periods.next_weekly_reset(now)),
    )


async def claim(
    db: AsyncSession, user_id: uuid.UUID, quest_id: str, now: datetime | None = None
) -> dict[str, int]:
    """Nhận thưởng nhiệm vụ đã đủ tiến trình trong kỳ hiện tại. Không commit."""
    q = BY_ID.get(quest_id)
    if q is None:
        raise AppError("NOT_FOUND", 404)
    key = period_key(q.scope, now)
    res = await db.execute(
        select(QuestProgress)
        .where(
            QuestProgress.user_id == user_id,
            QuestProgress.quest_id == q.id,
            QuestProgress.period == key,
        )
        .with_for_update()
    )
    row = res.scalar_one_or_none()
    if row is None or row.progress < q.target:
        raise AppError("QUEST_NOT_DONE", 409)
    if row.claimed_at is not None:
        raise AppError("QUEST_CLAIMED", 409)
    row.claimed_at = datetime.now(UTC)
    await wallet.grant(
        db,
        user_id,
        q.reward,
        source="quest",
        ref=f"{q.id}:{key}",
        idempotency_key=f"quest:{user_id}:{q.id}:{key}",
    )
    if q.scope == "daily":
        await record(db, user_id, "daily_claimed", 1, now)
    await db.flush()
    return q.reward
