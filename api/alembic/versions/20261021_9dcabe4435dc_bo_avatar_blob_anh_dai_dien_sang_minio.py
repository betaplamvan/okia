"""bo avatar_blob, anh dai dien sang MinIO

Ảnh đại diện chuyển sang object storage (app/storage.py), khóa avatars/{id}/{seq}.webp với
avatar_seq đếm số lần tải. Ảnh đã tải trước đó nằm trong cột avatar_blob bị bỏ, nên avatar_version
đưa về 0 (người dùng tải lại ảnh).

Revision ID: 9dcabe4435dc
Revises: c2523bc2a547
Create Date: 2026-10-21 10:14:00.785466
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "9dcabe4435dc"
down_revision: str | None = "c2523bc2a547"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_seq", sa.Integer(), server_default="0", nullable=False),
    )
    op.execute("UPDATE users SET avatar_version = 0 WHERE avatar_version <> 0")
    op.drop_column("users", "avatar_blob")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_blob", postgresql.BYTEA(), autoincrement=False, nullable=True),
    )
    op.drop_column("users", "avatar_seq")
