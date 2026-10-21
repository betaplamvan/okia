"""Kho skin và trang bị (docs/05 — Kinh tế, ADR-0013). Catalog nằm ở app/skins/catalog.json
(không có bảng items); `item_id` được kiểm tra theo catalog trong code."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin


class Inventory(Base, CreatedAtMixin):
    """Một dòng mỗi vật phẩm người chơi sở hữu (skin default không ghi — ai cũng có)."""

    __tablename__ = "inventory"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    item_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # purchase | reward | admin


class Loadout(Base):
    """Skin đang trang bị; không có dòng = dùng skin default."""

    __tablename__ = "loadouts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    pen: Mapped[str | None] = mapped_column(String(48))
    box: Mapped[str | None] = mapped_column(String(48))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
