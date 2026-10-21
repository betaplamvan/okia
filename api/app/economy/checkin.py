"""Điểm danh hằng ngày (ADR-0010): chu kỳ 7 ngày, lỡ một ngày thì về ngày 1.

Ngày tính theo giờ Việt Nam. Thưởng mỗi ngày là gói {lead, flower}; ngày 7 có Hoa điểm tốt.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.economy import periods, wallet
from app.errors import AppError
from app.models import Checkin

# Ngày 1..7 trong chu kỳ.
REWARDS: tuple[dict[str, int], ...] = (
    {"lead": 10},
    {"lead": 10},
    {"lead": 15},
    {"lead": 15},
    {"lead": 20},
    {"lead": 20},
    {"lead": 30, "flower": 1},
)
CYCLE = len(REWARDS)


@dataclass
class CheckinStatus:
    checked_today: bool
    streak: int  # số ngày liên tiếp tính tới hôm nay (0 nếu hôm nay chưa và hôm qua không có)
    cycle_day: int  # 1..7: ngày sẽ nhận (hoặc vừa nhận) hôm nay
    best_streak: int  # kỷ lục chuỗi dài nhất từng đạt (để khoe "Kỷ lục: n")
    rewards: tuple[dict[str, int], ...]
    next_reset: int  # epoch ms


async def _last(db: AsyncSession, user_id: uuid.UUID) -> Checkin | None:
    res = await db.execute(
        select(Checkin).where(Checkin.user_id == user_id).order_by(Checkin.day.desc()).limit(1)
    )
    return res.scalar_one_or_none()


def _streak_for_today(last: Checkin | None, today) -> tuple[bool, int]:
    """→ (hôm nay đã điểm danh?, streak hiệu lực hôm nay)."""
    if last is None:
        return False, 0
    if last.day == today:
        return True, last.streak
    if last.day == today - timedelta(days=1):
        return False, last.streak
    return False, 0


async def _best(db: AsyncSession, user_id: uuid.UUID) -> int:
    res = await db.execute(select(func.max(Checkin.streak)).where(Checkin.user_id == user_id))
    return int(res.scalar_one() or 0)


async def status(
    db: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> CheckinStatus:
    today = periods.today_vn(now)
    last = await _last(db, user_id)
    done, streak = _streak_for_today(last, today)
    cycle_day = ((streak - 1) % CYCLE) + 1 if done else (streak % CYCLE) + 1
    return CheckinStatus(
        checked_today=done,
        streak=streak,
        cycle_day=cycle_day,
        best_streak=max(await _best(db, user_id), streak),
        rewards=REWARDS,
        next_reset=periods.epoch_ms(periods.next_daily_reset(now)),
    )


async def check_in(
    db: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> tuple[CheckinStatus, dict[str, int]]:
    """Điểm danh hôm nay; trả (trạng thái mới, thưởng đã cộng). Không commit."""
    today = periods.today_vn(now)
    last = await _last(db, user_id)
    done, streak = _streak_for_today(last, today)
    if done:
        raise AppError("ALREADY_CHECKED_IN", 409)
    new_streak = streak + 1
    cycle_day = ((new_streak - 1) % CYCLE) + 1
    reward = REWARDS[cycle_day - 1]
    db.add(Checkin(user_id=user_id, day=today, streak=new_streak))
    await wallet.grant(
        db,
        user_id,
        reward,
        source="checkin",
        ref=today.isoformat(),
        idempotency_key=f"checkin:{user_id}:{today.isoformat()}",
    )
    await db.flush()
    return await status(db, user_id, now), reward
