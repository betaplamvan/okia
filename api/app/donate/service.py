"""Ủng hộ (docs/10 — Donate, ADR-0005): ghi giao dịch từ webhook, bóc tên / mã tài khoản trong nội
dung chuyển khoản, bảng cảm ơn.

Nội dung chuyển khoản do trang /donate gợi ý: `OKIA <tên muốn hiện>` hoặc `OKIA <mã 6 ký tự>` (6
ký tự hex đầu của user id, người đã đăng nhập). Ngân hàng thường chèn thêm chuỗi của họ
("MBVCB.123.OKIA Quan.CT tu 0123…") nên chỉ tìm mẫu `OKIA …` trong chuỗi, cắt ở dấu chấm / xuống
dòng, tối đa 24 ký tự. Số tiền không bao giờ ra public.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import String, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.donate import Donation

CONTENT_RE = re.compile(r"OKIA[\s_\-]*([^.\n\r]{1,40})", re.IGNORECASE)
CODE_RE = re.compile(r"^[0-9A-F]{6}$")
NAME_MAX = 24


def user_code(user_id: uuid.UUID) -> str:
    """Mã 6 ký tự gợi ý trong nội dung chuyển khoản của người đã đăng nhập."""
    return user_id.hex[:6].upper()


def clean_name(raw: str) -> str | None:
    """Tên hiện trên bảng cảm ơn: gộp khoảng trắng, bỏ ký tự điều khiển, tối đa NAME_MAX;
    rỗng → None."""
    s = re.sub(r"\s+", " ", unicodedata.normalize("NFC", raw))
    s = "".join(ch for ch in s if ch.isprintable()).strip(" -_")
    return s[:NAME_MAX] or None


def parse_content(content: str) -> tuple[str | None, str | None]:
    """→ (mã tài khoản, tên). Có mã thì tên = None (lấy tên hiển thị của tài khoản)."""
    m = CONTENT_RE.search(content or "")
    if not m:
        return None, None
    token = m.group(1).strip()
    first = token.split()[0] if token.split() else ""
    if CODE_RE.match(first.upper()):
        return first.upper(), None
    return None, clean_name(token)


async def user_by_code(db: AsyncSession, code: str) -> User | None:
    rows = (
        (
            await db.execute(
                select(User).where(User.id.cast(String).like(f"{code.lower()}%")).limit(2)
            )
        )
        .scalars()
        .all()
    )
    return rows[0] if len(rows) == 1 else None


async def record(
    db: AsyncSession,
    *,
    provider: str,
    external_id: str,
    amount: int,
    currency: str,
    content: str,
    received_at: datetime,
    raw: dict[str, Any],
    donor_name: str | None = None,
) -> Donation | None:
    """Ghi một giao dịch; trùng (provider, external_id) → None (webhook gửi lại vô hại)."""
    code, name = parse_content(content)
    user: User | None = None
    if code:
        user = await user_by_code(db, code)
        if user:
            name = clean_name(user.display_name)
    if donor_name and not name:
        name = clean_name(donor_name)
    d = Donation(
        provider=provider,
        external_id=external_id[:64],
        amount=amount,
        currency=currency[:3].upper(),
        content=(content or "")[:500],
        donor_name=name,
        user_id=user.id if user else None,
        received_at=received_at,
        raw=raw,
    )
    db.add(d)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return None
    return d


async def thanks(db: AsyncSession, limit: int = 100) -> list[Donation]:
    """Bảng cảm ơn: mới nhất trước, chỉ giao dịch có tên và không bị ẩn."""
    rows = (
        await db.execute(
            select(Donation)
            .where(Donation.hidden.is_(False), Donation.donor_name.is_not(None))
            .order_by(Donation.received_at.desc())
            .limit(limit)
        )
    ).scalars()
    return list(rows)
