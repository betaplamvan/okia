"""sessions.revoked_reason: phiên bị thay bởi lần đăng nhập mới

Một tài khoản chỉ giữ một phiên (docs/13 — Một phiên mỗi tài khoản): đăng nhập nơi mới thu hồi
phiên cũ với lý do `replaced`, để refresh ở nơi cũ trả `SESSION_REPLACED` thay vì bị coi là
dùng lại token (vốn thu hồi luôn phiên mới).

Revision ID: e4f1a7c9b2d0
Revises: d587729fc5d3
Create Date: 2026-10-21 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4f1a7c9b2d0"
down_revision: str | None = "d587729fc5d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("revoked_reason", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "revoked_reason")
