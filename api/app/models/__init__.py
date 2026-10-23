"""Model SQLAlchemy — nguồn chuẩn của schema (docs/05).

Import tất cả model ở đây để Alembic autogenerate nhìn thấy đủ bảng.
"""

from app.models.admin import AppConfig, SkinRow
from app.models.base import Base
from app.models.chat import ChatMessage
from app.models.donate import Donation
from app.models.economy import Checkin, QuestProgress, Wallet, WalletLedger
from app.models.match import Match
from app.models.rating import Rating, Season
from app.models.skins import Inventory, Loadout
from app.models.user import AuthIdentity, Session, User

__all__ = [
    "AppConfig",
    "AuthIdentity",
    "Base",
    "ChatMessage",
    "Checkin",
    "Donation",
    "Inventory",
    "Loadout",
    "Match",
    "QuestProgress",
    "Rating",
    "Season",
    "Session",
    "SkinRow",
    "User",
    "Wallet",
    "WalletLedger",
]
