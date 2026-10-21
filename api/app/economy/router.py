"""Endpoint ví / điểm danh / nhiệm vụ / avatar (ADR-0010, docs/06)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response, UploadFile
from pydantic import Field
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
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
    best_streak: int
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
            best_streak=st.best_streak,
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


def avatar_key(user_id: uuid.UUID, seq: int) -> str:
    return f"avatars/{user_id}/{seq}.webp"


def avatar_url_for(user: User) -> str | None:
    """Ảnh riêng (object storage) ưu tiên: mỗi lần tải một khóa mới nên URL bất biến, CDN cache
    thoải mái. Không có ảnh riêng → ảnh ngoài (Google) nếu có. Bucket không đọc công khai →
    đi qua API (/avatars/{id}/{n}.webp)."""
    from app.config import get_settings

    if user.avatar_version > 0:
        key = avatar_key(user.id, user.avatar_version)
        return storage.public_url(key) or f"{get_settings().api_base_url}/{key}"
    return user.avatar_url


@router.post("/me/avatar", response_model=UserOut)
async def me_upload_avatar(
    file: UploadFile, db: Db, user: Annotated[User, Depends(account_user)]
) -> UserOut:
    from app.auth.router import to_user_out

    data = await file.read(avatar.MAX_UPLOAD + 1)
    blob = avatar.normalize(data)
    st = storage.get_storage()
    seq = user.avatar_seq + 1
    # Ghi object mới trước, thành công mới đổi DB (lỗi storage → 503, DB không đổi).
    await st.put(avatar_key(user.id, seq), blob, "image/webp")
    old = user.avatar_version
    user.avatar_seq = seq
    user.avatar_version = seq
    await db.commit()
    if old > 0:
        await _delete_quietly(st, avatar_key(user.id, old))
    await db.refresh(user, attribute_names=["identities"])
    return to_user_out(user)


@router.delete("/me/avatar", response_model=UserOut)
async def me_delete_avatar(db: Db, user: Annotated[User, Depends(account_user)]) -> UserOut:
    from app.auth.router import to_user_out

    old = user.avatar_version
    user.avatar_version = 0
    await db.commit()
    if old > 0:
        await _delete_quietly(storage.get_storage(), avatar_key(user.id, old))
    await db.refresh(user, attribute_names=["identities"])
    return to_user_out(user)


async def _delete_quietly(st: storage.ObjectStorage, key: str) -> None:
    """Dọn object cũ sau khi DB đã đổi; lỗi storage không làm hỏng thao tác của người dùng."""
    try:
        await st.delete(key)
    except AppError:
        pass


@router.get("/avatars/{user_id}/{seq}.webp", include_in_schema=False)
async def avatar_file(user_id: uuid.UUID, seq: int) -> Response:
    """Phục vụ hộ khi bucket không cho đọc ẩn danh (S3_PUBLIC_URL trống) hoặc dev không có S3."""
    data = await storage.get_storage().get(avatar_key(user_id, seq))
    if data is None:
        raise AppError("NOT_FOUND", 404)
    return Response(
        content=data, media_type="image/webp", headers={"Cache-Control": storage.CACHE_IMMUTABLE}
    )
