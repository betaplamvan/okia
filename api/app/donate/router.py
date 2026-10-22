"""REST ủng hộ (docs/10 — Donate, ADR-0005).

- GET  /donate                 public: tài khoản nhận (ngân hàng), bảng cảm ơn (tên, tháng)
- POST /donate/webhook/sepay   SePay (header `Authorization: Apikey <SEPAY_API_KEY>`), chỉ tiền vào
- GET  /admin/donations · PATCH /admin/donations/{id}   (admin: đặt tên hiện / ẩn)
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import admin_user, optional_user
from app.auth.schemas import CamelModel
from app.config import get_settings
from app.db import get_db
from app.donate import service
from app.errors import AppError
from app.models import User
from app.models.donate import Donation

log = logging.getLogger("okia.donate")
router = APIRouter(tags=["donate"])
Db = Annotated[AsyncSession, Depends(get_db)]
MAX_BODY = 64 * 1024


class BankOut(CamelModel):
    bin: str
    name: str
    account_no: str
    account_name: str


class SupporterOut(CamelModel):
    user_id: uuid.UUID
    name: str
    avatar_url: str | None
    mine: bool = False


class DonateOut(CamelModel):
    # Chỉ tài khoản đã liên kết Google mới thấy tài khoản nhận (bắt buộc liên kết trước khi có QR).
    bank: BankOut | None
    # Nội dung chuyển khoản của người đã đăng nhập: OKIA <code> (6 ký tự hex đầu của user id).
    my_code: str | None
    supporters: list[SupporterOut]
    count: int


@router.get("/donate", response_model=DonateOut)
async def donate_info(db: Db, user: Annotated[User | None, Depends(optional_user)]) -> DonateOut:
    from app.economy.router import avatar_url_for

    s = get_settings()
    linked = user is not None and not user.is_guest
    bank = (
        BankOut(
            bin=s.donate_bank_bin,
            name=s.donate_bank_name,
            account_no=s.donate_account_no,
            account_name=s.donate_account_name,
        )
        if linked and s.donate_bank_bin and s.donate_account_no
        else None
    )
    rows = await service.supporters(db)
    total = (
        await db.execute(
            select(func.count(func.distinct(Donation.user_id))).where(
                Donation.hidden.is_(False), Donation.user_id.is_not(None)
            )
        )
    ).scalar_one()
    return DonateOut(
        bank=bank,
        my_code=service.user_code(user.id) if linked and user else None,
        supporters=[
            SupporterOut(
                user_id=u.id,
                name=u.display_name,
                avatar_url=avatar_url_for(u),
                mine=bool(user and u.id == user.id),
            )
            for u, _ in rows
        ],
        count=int(total),
    )


# ---------- Webhook ----------


def _parse_dt(raw: str | None) -> datetime:
    """SePay: "YYYY-MM-DD HH:MM:SS" giờ VN (hoặc ISO 8601). Lỗi → giờ hiện tại."""
    if raw:
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
            return dt
        except ValueError:
            pass
    return datetime.now(UTC)


@router.post("/donate/webhook/sepay")
async def webhook_sepay(request: Request, db: Db) -> dict[str, Any]:
    """SePay gửi JSON cho mỗi giao dịch (docs/10): id, transferType in/out, transferAmount, content,
    transactionDate, referenceCode… Chỉ ghi tiền vào; trả 200 kể cả khi bỏ qua / trùng."""
    s = get_settings()
    if not s.sepay_api_key:
        raise AppError("FORBIDDEN", 403)
    auth = request.headers.get("authorization", "")
    if auth.strip() != f"Apikey {s.sepay_api_key}":
        raise AppError("FORBIDDEN", 403)
    body = await request.body()
    if len(body) > MAX_BODY:
        raise AppError("BAD_REQUEST", 400)
    try:
        p = json.loads(body)
    except json.JSONDecodeError as e:
        raise AppError("BAD_REQUEST", 400) from e
    if not isinstance(p, dict) or p.get("transferType") != "in":
        return {"success": True, "ignored": True}
    try:
        amount = int(float(p.get("transferAmount") or 0))
    except (TypeError, ValueError):
        amount = 0
    ext = str(p.get("id") or p.get("referenceCode") or "")
    if amount <= 0 or not ext:
        return {"success": True, "ignored": True}
    d = await service.record(
        db,
        provider="sepay",
        external_id=ext,
        amount=amount,
        currency="VND",
        content=str(p.get("content") or p.get("description") or ""),
        received_at=_parse_dt(p.get("transactionDate")),
        raw=p,
    )
    if d is None:
        return {"success": True, "duplicate": True}
    await db.commit()
    log.info("ủng hộ sepay %s: %s VND, tên=%s", ext, amount, d.donor_name)
    return {"success": True}


# ---------- Admin ----------


class AdminDonationOut(CamelModel):
    id: uuid.UUID
    provider: str
    external_id: str
    amount: int
    currency: str
    content: str
    donor_name: str | None
    user_id: uuid.UUID | None
    received_at: datetime
    hidden: bool


class AdminDonationPage(CamelModel):
    items: list[AdminDonationOut]
    total: int
    sum_vnd: int


class DonationPatch(CamelModel):
    donor_name: str | None = None
    hidden: bool | None = None


def _out(d: Donation) -> AdminDonationOut:
    return AdminDonationOut(
        id=d.id,
        provider=d.provider,
        external_id=d.external_id,
        amount=d.amount,
        currency=d.currency,
        content=d.content,
        donor_name=d.donor_name,
        user_id=d.user_id,
        received_at=d.received_at,
        hidden=d.hidden,
    )


@router.get(
    "/admin/donations", response_model=AdminDonationPage, dependencies=[Depends(admin_user)]
)
async def admin_list(
    db: Db, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)
) -> AdminDonationPage:
    total = (await db.execute(select(func.count()).select_from(Donation))).scalar_one()
    sum_vnd = (
        await db.execute(
            select(func.coalesce(func.sum(Donation.amount), 0)).where(Donation.currency == "VND")
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(Donation).order_by(Donation.received_at.desc()).limit(limit).offset(offset)
        )
    ).scalars()
    return AdminDonationPage(items=[_out(d) for d in rows], total=int(total), sum_vnd=int(sum_vnd))


@router.patch(
    "/admin/donations/{donation_id}",
    response_model=AdminDonationOut,
    dependencies=[Depends(admin_user)],
)
async def admin_patch(donation_id: uuid.UUID, body: DonationPatch, db: Db) -> AdminDonationOut:
    d = await db.get(Donation, donation_id)
    if d is None:
        raise AppError("NOT_FOUND", 404)
    if body.donor_name is not None:
        d.donor_name = service.clean_name(body.donor_name)
    if body.hidden is not None:
        d.hidden = body.hidden
    await db.commit()
    return _out(d)
