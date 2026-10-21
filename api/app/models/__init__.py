"""Model SQLAlchemy — nguồn chuẩn của schema (docs/05).

Import tất cả model ở đây để Alembic autogenerate nhìn thấy đủ bảng.
"""

from app.models.base import Base
from app.models.economy import Checkin, QuestProgress, Wallet, WalletLedger
from app.models.match import Match
from app.models.rating import Rating, Season
from app.models.user import AuthIdentity, Session, User

__all__ = [
    "AuthIdentity",
    "Base",
    "Checkin",
    "Match",
    "QuestProgress",
    "Rating",
    "Season",
    "Session",
    "User",
    "Wallet",
    "WalletLedger",
]
