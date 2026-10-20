"""Ví hai loại tiền, sổ cái, điểm danh, tiến trình nhiệm vụ (docs/05 — Kinh tế, ADR-0010)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin

CURRENCIES = ("lead", "flower")  # Ruột chì | Hoa điểm tốt


class Wallet(Base, CreatedAtMixin):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("lead >= 0", name="lead_nonneg"),
        CheckConstraint("flower >= 0", name="flower_nonneg"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    lead: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    flower: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")


class WalletLedger(Base, CreatedAtMixin):
    """Chỉ INSERT, không UPDATE/DELETE. Mỗi thay đổi số dư một dòng, có khóa idempotency."""

    __tablename__ = "wallet_ledger"
    __table_args__ = (
        CheckConstraint("currency IN ('lead', 'flower')", name="currency"),
        Index("ix_wallet_ledger_user_id_id", "user_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False)
    delta: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # match | season | achievement | checkin | quest | chest_refund | purchase | chest | admin
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    ref: Mapped[str | None] = mapped_column(String(128))
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)


class Checkin(Base, CreatedAtMixin):
    """Một dòng mỗi ngày đã điểm danh (ngày giờ VN); `streak` = ngày thứ mấy trong chuỗi."""

    __tablename__ = "checkins"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class QuestProgress(Base, CreatedAtMixin):
    """Tiến trình một nhiệm vụ trong một kỳ (`period`: ngày `2026-10-21` hoặc tuần `2026-W43`)."""

    __tablename__ = "quest_progress"
    __table_args__ = (Index("ix_quest_progress_user_id_period", "user_id", "period"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    quest_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    period: Mapped[str] = mapped_column(String(16), primary_key=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
