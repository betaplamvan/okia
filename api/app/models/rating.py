"""Mùa giải và rating xếp hạng (docs/05 — Xếp hạng, docs/07, ADR-0012).

`ratings` giữ cả rating ẩn Glicko-2 (mmr/rd/vol — chỉ để ghép trận) và điểm hạng hiển thị
(`points` — thứ người chơi leo). Một dòng mỗi người mỗi mùa (xếp hạng luôn bốc map ngẫu nhiên nên
không tách theo bàn).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin


class Season(Base, CreatedAtMixin):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False)  # {"vi": …, "en": …}
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Rating(Base, CreatedAtMixin):
    __tablename__ = "ratings"
    __table_args__ = (Index("ix_ratings_season_id_points", "season_id", "points"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    season_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("seasons.id", ondelete="CASCADE"), primary_key=True
    )
    # Rating ẩn (Glicko-2) — không bao giờ gửi cho client.
    mmr: Mapped[float] = mapped_column(Float, nullable=False, server_default="1500")
    rd: Mapped[float] = mapped_column(Float, nullable=False, server_default="350")
    vol: Mapped[float] = mapped_column(Float, nullable=False, server_default="0.06")
    # Điểm hạng hiển thị (≥ 0) và thống kê.
    points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    peak_points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    games: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    wins: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    losses: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Thắng liên tiếp hiện tại / kỷ lục.
    streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    peak_tier: Mapped[str | None] = mapped_column(String(16))
    last_played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
