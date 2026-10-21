"""Catalog skin (docs/08). Nguồn: shared/skins/**.json → bản chép app/skins/catalog.json
(web/scripts/gen-skins.mjs); tests/test_skins.py báo đỏ nếu bản chép lệch nguồn.

Giá theo bậc hiếm (docs/06): trắng 100 · xanh lá 250 · xanh lam 600 Ruột chì · tím 1500 Ruột chì ·
vàng 5 Hoa điểm tốt. Skin `default` miễn phí, ai cũng có.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any, Literal

SkinType = Literal["pen", "box"]
Rarity = Literal["common", "uncommon", "rare", "epic", "legendary"]

TYPES: tuple[SkinType, ...] = ("pen", "box")
RARITIES: tuple[Rarity, ...] = ("common", "uncommon", "rare", "epic", "legendary")
RARITY_PRICE: dict[str, dict[str, int]] = {
    "common": {"lead": 100},
    "uncommon": {"lead": 250},
    "rare": {"lead": 600},
    "epic": {"lead": 1500},
    "legendary": {"flower": 5},
}


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
        return {} if self.default else RARITY_PRICE[self.rarity]


@cache
def all_skins() -> dict[str, Skin]:
    raw = json.loads((Path(__file__).with_name("catalog.json")).read_text(encoding="utf-8"))
    out: dict[str, Skin] = {}
    for m in raw["skins"]:
        out[m["id"]] = Skin(
            id=m["id"],
            type=m["type"],
            rarity=m["rarity"],
            name=m["name"],
            description=m["description"],
            default=bool(m.get("default", False)),
            manifest=m,
        )
    return out


def get_skin(skin_id: str) -> Skin | None:
    return all_skins().get(skin_id)


def by_type(skin_type: SkinType) -> list[Skin]:
    return [s for s in all_skins().values() if s.type == skin_type]


@cache
def default_id(skin_type: SkinType) -> str:
    return next(s.id for s in all_skins().values() if s.type == skin_type and s.default)


def default_loadout() -> dict[str, str]:
    return {t: default_id(t) for t in TYPES}
