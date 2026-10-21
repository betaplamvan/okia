"""bo mat khau: chi khach va Google

ADR-0011: không còn đăng ký/đăng nhập bằng email + mật khẩu. Gỡ identity `password`; tài khoản
chỉ có mật khẩu mà email chưa xác minh thì xóa mềm (giải phóng email); tài khoản đã xác minh giữ
lại — đăng nhập Google cùng email sẽ tự liên kết vào. Bỏ cột secret_hash và ràng buộc kèm theo.

Revision ID: b8a6698d621e
Revises: 9dcabe4435dc
Create Date: 2026-10-21 10:58:02.362144
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b8a6698d621e"
down_revision: str | None = "9dcabe4435dc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DELETE FROM auth_identities WHERE provider = 'password'")
    op.execute(
        """
        UPDATE users SET deleted_at = now(), email = NULL, token_version = token_version + 1
        WHERE deleted_at IS NULL AND is_guest = false AND email_verified_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM auth_identities i WHERE i.user_id = users.id AND i.provider = 'google'
          )
        """
    )
    op.drop_constraint("password_has_hash", "auth_identities", type_="check")
    op.drop_column("auth_identities", "secret_hash")


def downgrade() -> None:
    op.add_column(
        "auth_identities",
        sa.Column("secret_hash", sa.String(length=256), autoincrement=False, nullable=True),
    )
    op.create_check_constraint(
        "password_has_hash",
        "auth_identities",
        "(provider = 'password') = (secret_hash IS NOT NULL)",
    )
