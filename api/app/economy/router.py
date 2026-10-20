"""Endpoint ví / điểm danh / nhiệm vụ / avatar (ADR-0010, docs/06)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response, UploadFile
from pydantic import Field
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import ratelimit
from app.auth.deps import account_user, current_user, get_redis, verified_user
from app.auth.schemas import CamelModel, UserOut
from app.db import get_db
from app.economy import avatar, checkin, quests, wallet
from app.errors import AppError
from app.models import User

router = APIRouter(tags=["economy"])
Db = Annotated[AsyncSession, Depends(get_db)]
Rd = Annotated[Redis, Depends(get_redis)]


# ---------- Schema ----------


class WalletOut(CamelModel):
    lead: int
    flower: int


class CheckinOut(CamelModel):
    checked_today: bool
    streak: int
    cycle_day: int
    rewards: list[dict[str, int]]
    next_reset: int


class QuestOut(CamelModel):
    id: str
    scope: Literal["daily", "weekly"]
    target: int
    progress: int
    reward: dict[str, int]
    claimed: bool


class ProgressOut(CamelModel):
    wallet: WalletOut
    can_claim: bool  # tài khoản đã xác minh email (khách/chưa xác minh: chỉ xem)
    checkin: CheckinOut
    quests: list[QuestOut]
    daily_reset: int
    weekly_reset: int


class RewardOut(CamelModel):
    reward: dict[str, int]
    progress: ProgressOut


class EventIn(CamelModel):
    """Ván với máy chạy ở client (giai đoạn 0) → client báo kết quả. Chỉ nuôi nhiệm vụ,
    không cộng tiền trực tiếp; sẽ chuyển sang server ở P2-06."""

    type: Literal["bot_game"]
    won: bool
    max_combo: int = Field(ge=0, le=64)
    moves: int = Field(ge=1, le=512)


# ---------- Tiện ích ----------


async def build_progress(db: AsyncSession, user: User) -> ProgressOut:
    st = await checkin.status(db, user.id)
    views, daily_reset, weekly_reset = await quests.snapshot(db, user.id)
    bal = await wallet.balances(db, user.id)
    return ProgressOut(
        wallet=WalletOut(**bal),
        can_claim=(not user.is_guest) and user.email_verified_at is not None,
        checkin=CheckinOut(
            checked_today=st.checked_today,
            streak=st.streak,
            cycle_day=st.cycle_day,
            rewards=list(st.rewards),
            next_reset=st.next_reset,
        ),
        quests=[
            QuestOut(
                id=v.id,
                scope=v.scope,
                target=v.target,
                progress=v.progress,
                reward=v.reward,
                claimed=v.claimed,
            )
            for v in views
        ],
        daily_reset=daily_reset,
        weekly_reset=weekly_reset,
    )


# ---------- Tiến trình ----------


@router.get("/me/progress", response_model=ProgressOut)
async def me_progress(db: Db, user: Annotated[User, Depends(current_user)]) -> ProgressOut:
    return await build_progress(db, user)


@router.post("/me/checkin", response_model=RewardOut)
async def me_checkin(db: Db, user: Annotated[User, Depends(verified_user)]) -> RewardOut:
    _, reward = await checkin.check_in(db, user.id)
    await db.commit()
    return RewardOut(reward=reward, progress=await build_progress(db, user))


@router.post("/me/quests/{quest_id}/claim", response_model=RewardOut)
async def me_claim_quest(
    quest_id: str, db: Db, user: Annotated[User, Depends(verified_user)]
) -> RewardOut:
    reward = await quests.claim(db, user.id, quest_id)
    await db.commit()
    return RewardOut(reward=reward, progress=await build_progress(db, user))


@router.post("/me/events", response_model=ProgressOut)
async def me_event(
    body: EventIn,
    request: Request,
    db: Db,
    redis: Rd,
    user: Annotated[User, Depends(account_user)],
) -> ProgressOut:
    # Một ván nhỏ nhất (map ẩn 3×3) cũng ≥ 24 nước; chặn spam theo người dùng.
    await ratelimit.hit(redis, f"events:{user.id}", 30, 3600)
    if body.moves < 24:
        raise AppError("BAD_MESSAGE", 422)
    await quests.record_game(db, user.id, won=body.won, online=False, max_combo=body.max_combo)
    await db.commit()
    return await build_progress(db, user)


# ---------- Avatar ----------


def avatar_url_for(user: User) -> str | None:
    from app.config import get_settings

    if user.avatar_version > 0:
        return f"{get_settings().api_base_url}/avatars/{user.id}.webp?v={user.avatar_version}"
    return user.avatar_url


@router.post("/me/avatar", response_model=UserOut)
async def me_upload_avatar(
    file: UploadFile, db: Db, user: Annotated[User, Depends(account_user)]
) -> UserOut:
    from app.auth.router import to_user_out

    data = await file.read(avatar.MAX_UPLOAD + 1)
    blob = avatar.normalize(data)
    user.avatar_blob = blob
    user.avatar_version += 1
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])
    return to_user_out(user)


@router.delete("/me/avatar", response_model=UserOut)
async def me_delete_avatar(db: Db, user: Annotated[User, Depends(account_user)]) -> UserOut:
    from app.auth.router import to_user_out

    user.avatar_blob = None
    user.avatar_version = 0
    await db.commit()
    await db.refresh(user, attribute_names=["identities"])
    return to_user_out(user)


@router.get("/avatars/{user_id}.webp", include_in_schema=False)
async def avatar_file(user_id: uuid.UUID, db: Db, v: int = 0) -> Response:
    res = await db.execute(select(User.avatar_blob, User.avatar_version).where(User.id == user_id))
    row = res.first()
    if row is None or not row[0]:
        raise AppError("NOT_FOUND", 404)
    return Response(
        content=row[0],
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
