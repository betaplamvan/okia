"""Bảng `donations` (docs/10 — Donate, ADR-0005): mỗi giao dịch ủng hộ nhận qua webhook (SePay cho
ngân hàng Việt Nam, Ko-fi cho nước ngoài). Không đổi lấy gì trong game; bảng cảm ơn chỉ hiện
`donor_name` (người ủng hộ tự ghi trong nội dung chuyển khoản), không bao giờ hiện số tiền."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Donation(Base):
    __tablename__ = "donations"
    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_donations_provider_ext"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)  # sepay | kofi
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # đơn vị nhỏ nhất (VND / cent)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="VND")
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # Tên hiện trên bảng cảm ơn (từ nội dung chuyển khoản hoặc admin đặt); None = ẩn danh.
    donor_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Người chơi (nếu nội dung có mã tài khoản) — không nhận gì trong game, chỉ để tô "bạn".
    user_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
