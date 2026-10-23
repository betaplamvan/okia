"""Sở hữu, mua và trang bị skin (docs/06 — Quy tắc ví, ADR-0013). Caller commit."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.economy import wallet
from app.errors import AppError
from app.models import Inventory, Loadout
from app.skins import catalog


async def owned_ids(db: AsyncSession, user_id: uuid.UUID) -> set[str]:
    """Skin sở hữu, luôn gồm các skin default."""
    res = await db.execute(select(Inventory.item_id).where(Inventory.user_id == user_id))
    ids = {r for r in res.scalars() if r in catalog.all_skins()}
    ids.update(catalog.default_ids())
    return ids


async def loadout_of(db: AsyncSession, user_id: uuid.UUID) -> dict[str, str]:
    """Skin đang trang bị theo loại; thiếu / không còn hợp lệ → default."""
    row = (await db.execute(select(Loadout).where(Loadout.user_id == user_id))).scalar_one_or_none()
    out = catalog.default_loadout()
    if row is None:
        return out
    for t in catalog.LOADOUT_TYPES:
        sid = getattr(row, t)
        s = catalog.get_skin(sid) if sid else None
        if s is not None and s.type == t:
            out[t] = sid
    return out


async def loadouts_of(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[str, dict[str, str]]:
    """Loadout của nhiều người (gửi trong `room_state.loadouts`, key = user id dạng chuỗi)."""
    res = await db.execute(select(Loadout).where(Loadout.user_id.in_(user_ids)))
    rows = {r.user_id: r for r in res.scalars()}
    out: dict[str, dict[str, str]] = {}
    for uid in user_ids:
        lo = catalog.default_loadout()
        row = rows.get(uid)
        if row is not None:
            for t in catalog.LOADOUT_TYPES:
                sid = getattr(row, t)
                s = catalog.get_skin(sid) if sid else None
                if s is not None and s.type == t:
                    lo[t] = sid
        out[str(uid)] = lo
    return out


async def buy(db: AsyncSession, user_id: uuid.UUID, skin_id: str) -> catalog.Skin:
    """Mua lẻ: trừ ví (Ruột chì hoặc Hoa) + thêm vào kho trong cùng transaction. Idempotency theo
    `buy:{user}:{skin}` — mua lại cùng skin không trừ tiền lần hai (ALREADY_OWNED)."""
    skin = catalog.get_skin(skin_id)
    if skin is None:
        raise AppError("UNKNOWN_ITEM", 404)
    if skin.default or skin_id in await owned_ids(db, user_id):
        raise AppError("ALREADY_OWNED", 409)
    for cur, amount in skin.price.items():
        await wallet.debit(
            db,
            user_id,
            cur,  # type: ignore[arg-type]
            amount,
            source="purchase",
            ref=skin_id,
            idempotency_key=f"buy:{user_id}:{skin_id}",
        )
    try:
        async with db.begin_nested():
            db.add(Inventory(user_id=user_id, item_id=skin_id, source="purchase"))
            await db.flush()
    except IntegrityError as e:  # pragma: no cover — hai request cùng lúc
        raise AppError("ALREADY_OWNED", 409) from e
    return skin


async def equip(
    db: AsyncSession, user_id: uuid.UUID, *, pen: str | None = None, box: str | None = None
) -> dict[str, str]:
    """Trang bị skin đã sở hữu (None = giữ nguyên). Trả loadout mới."""
    owned = await owned_ids(db, user_id)
    wanted = {"pen": pen, "box": box}
    for t, sid in wanted.items():
        if sid is None:
            continue
        s = catalog.get_skin(sid)
        if s is None or s.type != t:
            raise AppError("UNKNOWN_ITEM", 404)
        if sid not in owned:
            raise AppError("NOT_OWNED", 403)
    row = (await db.execute(select(Loadout).where(Loadout.user_id == user_id))).scalar_one_or_none()
    if row is None:
        row = Loadout(user_id=user_id)
        db.add(row)
    for t, sid in wanted.items():
        if sid is not None:
            setattr(row, t, sid)
    row.updated_at = datetime.now(UTC)
    await db.flush()
    return await loadout_of(db, user_id)
