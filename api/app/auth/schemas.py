"""Pydantic cho /auth và /me (docs/13). Tên trường camelCase cho client."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.alias_generators import to_camel

Locale = Literal["vi", "en"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class GuestIn(CamelModel):
    device_id: str = Field(min_length=8, max_length=64)
    locale: Locale | None = None


class DevLoginIn(CamelModel):
    """Chỉ ngoài production: tạo/đăng nhập tài khoản đã xác minh không qua Google (smoke test)."""

    email: EmailStr
    display_name: str | None = Field(default=None, max_length=32)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class MePatch(CamelModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=32)
    locale: Locale | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            raise ValueError("empty")
        return v


class IdentityOut(CamelModel):
    provider: str  # hiện chỉ "google"; không lộ subject


class WalletBrief(CamelModel):
    lead: int = 0
    flower: int = 0


class UserOut(CamelModel):
    id: uuid.UUID
    display_name: str
    avatar_url: str | None
    has_custom_avatar: bool = False
    wallet: WalletBrief = WalletBrief()
    email: str | None
    email_verified: bool
    is_guest: bool
    locale: Locale
    created_at: datetime
    identities: list[IdentityOut]


class TokenOut(CamelModel):
    access_token: str
    expires_in: int
    user: UserOut
    # "switched": khách đăng nhập vào tài khoản đã có → tài khoản khách bị bỏ (docs/13 — Gộp).
    switched: bool = False


class OkOut(CamelModel):
    ok: bool = True


class GoogleStartOut(CamelModel):
    url: str
