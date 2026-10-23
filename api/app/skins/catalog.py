"""Catalog skin (docs/08).

Nguồn lúc chạy là bảng `skins` trong DB (quản trị ở trang admin; portable: gói zip
`<id>.okiaskin.zip` theo shared/skins/SPEC.md — app/skins/package.py — hoặc JSON manifest không
kèm file). Manifest trong DB có thể mang `assets` {ver, files}; khi đưa ra client được gắn thêm
`assets.base` (asset_base) để client tải ảnh / tiếng của gói. Bản chép app/skins/catalog.json
(sinh bởi web/scripts/gen-skins.mjs từ shared/skins) chỉ còn vai trò **seed**: lúc khởi động, id
nào chưa có trong DB thì được chèn. Tests/test_skins.py vẫn báo đỏ nếu bản chép lệch nguồn.

Mỗi tiến trình giữ cache trong bộ nhớ (hàm sync `all_skins()` dùng ở nhiều chỗ); `refresh_loop`
đọc lại DB mỗi REFRESH_SECONDS, admin sửa thì tiến trình đó cập nhật ngay.

Giá theo bậc hiếm (docs/06, chỉnh được ở admin `rarity_price`): trắng 100 · xanh lá 250 · xanh lam
600 Ruột chì · tím 1500 Ruột chì · vàng 5 Hoa điểm tốt. Skin `default` miễn phí, ai cũng có.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import SkinRow

log = logging.getLogger("okia.skins")

SkinType = Literal["pen", "box", "throw"]
Rarity = Literal["common", "uncommon", "rare", "epic", "legendary"]

TYPES: tuple[SkinType, ...] = ("pen", "box", "throw")
# Loại có ô "trang bị" (bảng loadouts). Đồ ném (throw, 2026-10-24) sở hữu là dùng, không trang bị.
LOADOUT_TYPES: tuple[SkinType, ...] = ("pen", "box")
RARITIES: tuple[Rarity, ...] = ("common", "uncommon", "rare", "epic", "legendary")
DEFAULT_RARITY_PRICE: dict[str, dict[str, int]] = {
    "common": {"lead": 100},
    "uncommon": {"lead": 250},
    "rare": {"lead": 600},
    "epic": {"lead": 1500},
    "legendary": {"flower": 5},
}
REFRESH_SECONDS = 15
ID_RE = re.compile(r"^[a-z0-9_]{3,48}$")


def rarity_price() -> dict[str, dict[str, int]]:
    """Giá theo bậc: thông số admin `rarity_price` (app/admin/config.py), mặc định
    DEFAULT_RARITY_PRICE."""
    from app.admin import config as appconfig

    raw = appconfig.get("rarity_price")
    out = dict(DEFAULT_RARITY_PRICE)
    if isinstance(raw, dict):
        for k, v in raw.items():
            if k in RARITIES and isinstance(v, dict):
                out[k] = {c: int(n) for c, n in v.items() if c in ("lead", "flower") and int(n) > 0}
    return out


@dataclass(frozen=True, slots=True)
class Skin:
    id: str
    type: SkinType
    rarity: Rarity
    name: dict[str, str]
    description: dict[str, str]
    default: bool
    manifest: dict[str, Any]

    @property
    def price(self) -> dict[str, int]:
        return {} if self.default else rarity_price()[self.rarity]


def asset_base(skin_id: str, ver: str) -> str:
    """URL gốc của asset gói skin: API tự phục vụ (GET /skins/assets/…, Cache-Control immutable)."""
    from app.config import get_settings

    return f"{get_settings().api_base_url.rstrip('/')}/skins/assets/{skin_id}/{ver}"


def _to_skin(m: dict[str, Any]) -> Skin:
    a = m.get("assets")
    if isinstance(a, dict) and a.get("files"):
        m = {**m, "assets": {**a, "base": asset_base(m["id"], a["ver"])}}
    return Skin(
        id=m["id"],
        type=m["type"],
        rarity=m["rarity"],
        name=m["name"],
        description=m["description"],
        default=bool(m.get("default", False)),
        manifest=m,
    )


def seed_manifests() -> list[dict[str, Any]]:
    raw = json.loads((Path(__file__).with_name("catalog.json")).read_text(encoding="utf-8"))
    return list(raw["skins"])


# Cache: khởi đầu từ bản seed (tests không có lifespan vẫn dùng được), thay bằng DB khi sync.
_cache: dict[str, Skin] = {m["id"]: _to_skin(m) for m in seed_manifests()}
_from_db = False


def all_skins() -> dict[str, Skin]:
    return _cache


def get_skin(skin_id: str) -> Skin | None:
    return _cache.get(skin_id)


def by_type(skin_type: SkinType) -> list[Skin]:
    return [s for s in _cache.values() if s.type == skin_type]


def default_id(skin_type: SkinType) -> str:
    return next(s.id for s in _cache.values() if s.type == skin_type and s.default)


def default_loadout() -> dict[str, str]:
    return {t: default_id(t) for t in LOADOUT_TYPES}


def default_ids() -> set[str]:
    """Skin default mọi loại (ai cũng có, kể cả đồ ném mặc định)."""
    return {default_id(t) for t in TYPES}


def set_cache(manifests: list[dict[str, Any]]) -> None:
    """Thay cache (sau khi đọc DB). Giữ nguyên nếu danh sách không có đủ skin default mỗi loại."""
    global _cache, _from_db
    new = {m["id"]: _to_skin(m) for m in manifests}
    for t in TYPES:
        if not any(s.type == t and s.default for s in new.values()):
            log.error("catalog DB thiếu skin default cho %s — giữ cache cũ", t)
            return
    _cache = new
    _from_db = True


async def seed(db: AsyncSession) -> int:
    """Chèn các skin seed còn thiếu trong DB (không ghi đè bản admin đã sửa). Trả số dòng chèn."""
    have = set((await db.execute(select(SkinRow.id))).scalars())
    n = 0
    for i, m in enumerate(seed_manifests()):
        if m["id"] in have:
            continue
        db.add(SkinRow(id=m["id"], type=m["type"], rarity=m["rarity"], sort=i, manifest=m))
        n += 1
    if n:
        await db.flush()
    return n


async def sync_from_db(db: AsyncSession) -> None:
    rows = (
        await db.execute(
            select(SkinRow).where(SkinRow.enabled.is_(True)).order_by(SkinRow.sort, SkinRow.id)
        )
    ).scalars()
    set_cache([r.manifest for r in rows])


async def refresh_loop(interval: float = REFRESH_SECONDS) -> None:
    """Task nền mỗi tiến trình: đọc lại catalog (và thông số admin) từ DB."""
    import asyncio

    from app.admin import config as appconfig
    from app.db import get_session_factory

    while True:
        await asyncio.sleep(interval)
        try:
            async with get_session_factory()() as db:
                await sync_from_db(db)
                await appconfig.sync_from_db(db)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("không đọc lại được catalog/thông số")
