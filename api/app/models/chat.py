"""Bảng `chat_messages` (docs/15 — Chat tổng): tin nhắn kênh chung toàn trang. Id tăng dần (bigint
identity) để client phân trang (`before`) và đếm tin chưa đọc theo id cuối đã xem."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Trả lời tin nào (giữ id kể cả khi tin gốc bị xóa — client hiện "tin đã xóa").
    reply_to_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    # Xóa mềm (kiểm duyệt — đợt sau).
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
