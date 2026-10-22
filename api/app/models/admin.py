"""Bảng quản trị (docs/13 — Admin): catalog skin trong DB và thông số chỉnh được."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SkinRow(Base):
    """Một skin của catalog (docs/08). `manifest` = JSON đúng định dạng shared/skins/**.json
    (portable: export/import nguyên văn). Seed từ app/skins/catalog.json lúc khởi động cho id còn
    thiếu."""

    __tablename__ = "skins"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    type: Mapped[str] = mapped_column(String(8), nullable=False)  # pen | box
    rarity: Mapped[str] = mapped_column(String(16), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class AppConfig(Base):
    """Thông số vận hành chỉnh ở trang admin (docs/06): key → JSON. Mặc định trong
    app/admin/config.py."""

    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
