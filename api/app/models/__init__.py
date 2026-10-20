"""Model SQLAlchemy — nguồn chuẩn của schema (docs/05).

Import tất cả model ở đây để Alembic autogenerate nhìn thấy đủ bảng.
"""

from app.models.base import Base
from app.models.match import Match
from app.models.user import AuthIdentity, Session, User

__all__ = ["AuthIdentity", "Base", "Match", "Session", "User"]
