"""Ví hai loại tiền (docs/06 — Quy tắc ví): mọi thay đổi số dư đi qua credit/debit,
`SELECT … FOR UPDATE` + ledger trong cùng transaction, idempotency theo khóa."""

import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Wallet, WalletLedger

Currency = Literal["lead", "flower"]


async def get_or_create(
    db: AsyncSession, user_id: uuid.UUID, *, for_update: bool = False
) -> Wallet:
    stmt = select(Wallet).where(Wallet.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    wallet = (await db.execute(stmt)).scalar_one_or_none()
    if wallet is None:
        wallet = Wallet(user_id=user_id, lead=0, flower=0)
        db.add(wallet)
        try:
            await db.flush()
        except IntegrityError:
            # Hai request cùng tạo ví: lấy lại dòng đã có.
            await db.rollback()
            wallet = (await db.execute(stmt)).scalar_one()
    return wallet


async def balances(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    w = (await db.execute(select(Wallet).where(Wallet.user_id == user_id))).scalar_one_or_none()
    return {"lead": w.lead if w else 0, "flower": w.flower if w else 0}


async def _apply(
    db: AsyncSession,
    user_id: uuid.UUID,
    currency: Currency,
    delta: int,
    *,
    source: str,
    ref: str | None,
    idempotency_key: str,
) -> bool:
    """Trả True nếu đã ghi, False nếu khóa idempotency đã tồn tại (bỏ qua). Không commit."""
    exists = await db.execute(
        select(WalletLedger.id).where(WalletLedger.idempotency_key == idempotency_key)
    )
    if exists.scalar_one_or_none() is not None:
        return False
    wallet = await get_or_create(db, user_id, for_update=True)
    current = getattr(wallet, currency)
    if current + delta < 0:
        raise AppError("INSUFFICIENT_FUNDS", 409)
    setattr(wallet, currency, current + delta)
    db.add(
        WalletLedger(
            user_id=user_id,
            currency=currency,
            delta=delta,
            balance_after=current + delta,
            source=source,
            ref=ref,
            idempotency_key=idempotency_key,
        )
    )
    await db.flush()
    return True


async def credit(
    db: AsyncSession,
    user_id: uuid.UUID,
    currency: Currency,
    amount: int,
    *,
    source: str,
    ref: str | None = None,
    idempotency_key: str,
) -> bool:
    if amount <= 0:
        raise ValueError("amount phải dương")
    return await _apply(
        db, user_id, currency, amount, source=source, ref=ref, idempotency_key=idempotency_key
    )


async def debit(
    db: AsyncSession,
    user_id: uuid.UUID,
    currency: Currency,
    amount: int,
    *,
    source: str,
    ref: str | None = None,
    idempotency_key: str,
) -> bool:
    if amount <= 0:
        raise ValueError("amount phải dương")
    return await _apply(
        db, user_id, currency, -amount, source=source, ref=ref, idempotency_key=idempotency_key
    )


async def grant(
    db: AsyncSession,
    user_id: uuid.UUID,
    rewards: dict[str, int],
    *,
    source: str,
    ref: str | None,
    idempotency_key: str,
) -> None:
    """Cộng một gói thưởng {lead: n, flower: m} (mỗi loại một dòng ledger, chung khóa + hậu tố)."""
    for cur, amount in rewards.items():
        if amount > 0:
            await credit(
                db,
                user_id,
                cur,  # type: ignore[arg-type]
                amount,
                source=source,
                ref=ref,
                idempotency_key=f"{idempotency_key}:{cur}",
            )
