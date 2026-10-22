"""Bảng `skins` (catalog quản trị được, portable JSON) và `app_config` (thông số chỉnh ở admin)

docs/08 — Catalog trong DB; docs/13 — Admin. Bảng `skins` được API tự nạp (seed) từ
app/skins/catalog.json lúc khởi động cho các id còn thiếu, nên không cần migration dữ liệu.

Revision ID: f0a1b2c3d4e5
Revises: e4f1a7c9b2d0
Create Date: 2026-10-22 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | None = "e4f1a7c9b2d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "skins",
        sa.Column("id", sa.String(length=48), nullable=False),
        sa.Column("type", sa.String(length=8), nullable=False),
        sa.Column("rarity", sa.String(length=16), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort", sa.Integer(), server_default="0", nullable=False),
        sa.Column("manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_skins")),
    )
    op.create_table(
        "app_config",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_app_config")),
    )


def downgrade() -> None:
    op.drop_table("app_config")
    op.drop_table("skins")
