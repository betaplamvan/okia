"""Trận đấu đã kết thúc (docs/05 — Xếp hạng & trận đấu). season_id tham chiếu bảng seasons ở 2A."""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, Float, ForeignKey, Index, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin


class Match(Base, CreatedAtMixin):
    __tablename__ = "matches"
    __table_args__ = (
        Index("ix_matches_player0_ended_at", "player0", "ended_at"),
        Index("ix_matches_player1_ended_at", "player1", "ended_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)  # casual | ranked | private
    board: Mapped[str] = mapped_column(String(8), nullable=False)  # 3x3 | 5x5 | 7x7
    season_id: Mapped[int | None] = mapped_column(Integer)
    player0: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    player1: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    bot_strength: Mapped[float | None] = mapped_column(Float)
    moves: Mapped[list[dict[str, object]]] = mapped_column(JSONB, nullable=False)
    scores: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    winner: Mapped[int | None] = mapped_column(SmallInteger)  # 0 | 1 | NULL (hòa)
    end_reason: Mapped[str] = mapped_column(String(16), nullable=False)  # complete|resign|afk
    rating_delta: Mapped[list[float] | None] = mapped_column(ARRAY(Float))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
