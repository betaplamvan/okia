"""Tài khoản, identity đăng nhập và phiên refresh (docs/05 — Tài khoản, docs/13)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin
from app.models.economy import Wallet
from app.models.skins import Loadout


class User(Base, CreatedAtMixin):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("locale IN ('vi', 'en')", name="locale"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    display_name: Mapped[str] = mapped_column(String(32), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512))  # ảnh ngoài (Google)
    # Ảnh tự tải lên (ADR-0010): object `avatars/{id}/{n}.webp` trên MinIO/S3 (app/storage.py).
    # avatar_seq đếm số lần tải (không giảm) → mỗi lần tải một URL mới, CDN cache bất biến không
    # dính ảnh cũ; avatar_version = seq đang dùng, 0 = không có ảnh riêng.
    avatar_seq: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    avatar_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    email: Mapped[str | None] = mapped_column(
        String(254), unique=True
    )  # đã lower(); NULL với khách
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_bounced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    locale: Mapped[str] = mapped_column(String(2), nullable=False, server_default="vi")
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # xóa mềm
    # Đã ủng hộ (docs/10 — Donate): bỏ quảng cáo vĩnh viễn + Trống Đồng Tri Ân trong hồ sơ.
    ad_free_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    identities: Mapped[list["AuthIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    wallet: Mapped["Wallet | None"] = relationship(lazy="selectin", uselist=False)
    loadout: Mapped["Loadout | None"] = relationship(lazy="selectin", uselist=False)


class AuthIdentity(Base, CreatedAtMixin):
    __tablename__ = "auth_identities"
    __table_args__ = (Index("ix_auth_identities_user_id", "user_id"),)

    provider: Mapped[str] = mapped_column(String(16), primary_key=True)  # guest|google
    subject: Mapped[str] = mapped_column(String(254), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user: Mapped[User] = relationship(back_populates="identities")


class Session(Base, CreatedAtMixin):
    """Refresh token (băm SHA-256), xoay mỗi lần dùng (docs/13 — Phiên & token)."""

    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    refresh_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(256))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "replaced" = bị đá bởi lần đăng nhập ở nơi khác (docs/13); NULL = xoay / đăng xuất.
    revoked_reason: Mapped[str | None] = mapped_column(String(16))
    replaced_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
