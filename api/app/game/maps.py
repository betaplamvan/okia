"""Bể map (docs/03 — Map). Port của web/src/game/maps.ts.

Nguồn: shared/maps/maps.json → bản chép app/game/maps.json (web/scripts/gen-maps.mjs), vì image api
build với context api/ không thấy shared/. tests/test_maps.py báo đỏ nếu bản chép lệch nguồn.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Literal

from app.game import rules

RANDOM_MAP = "random"
DEFAULT_MAP_ID = "5x5"


@dataclass(frozen=True, slots=True)
class GameMap:
    id: str
    name: dict[str, str]
    kind: Literal["rect", "shape"]
    hidden: bool
    cells: tuple[str, ...]
    rows: int
    cols: int
    mask: tuple[bool, ...]

    @property
    def box_count(self) -> int:
        return sum(self.mask)


def _build(src: dict) -> GameMap:  # type: ignore[type-arg]
    cells = tuple(src["cells"])
    return GameMap(
        id=src["id"],
        name=src["name"],
        kind=src["kind"],
        hidden=bool(src.get("hidden", False)),
        cells=cells,
        rows=len(cells),
        cols=len(cells[0]),
        mask=tuple(ch == "#" for row in cells for ch in row),
    )


@cache
def all_maps() -> dict[str, GameMap]:
    raw = json.loads((Path(__file__).with_name("maps.json")).read_text(encoding="utf-8"))
    return {m["id"]: _build(m) for m in raw["maps"]}


def pool() -> list[GameMap]:
    """Map người chơi chọn được / bốc ngẫu nhiên (bỏ map ẩn chỉ dành cho test)."""
    return [m for m in all_maps().values() if not m.hidden]


def get_map(map_id: str) -> GameMap | None:
    return all_maps().get(map_id)


def random_map_id(rng: random.Random | None = None) -> str:
    return (rng or random).choice(pool()).id


def resolve(map_id: str, *, allow_hidden: bool = False) -> GameMap | None:
    """ "random" → một map trong bể; id lạ hoặc map ẩn (khi không cho phép) → None."""
    if map_id == RANDOM_MAP:
        map_id = random_map_id()
    m = get_map(map_id)
    if m is None or (m.hidden and not allow_hidden):
        return None
    return m


def create_game(m: GameMap) -> rules.GameState:
    return rules.create_game(m.rows, m.cols, None if m.kind == "rect" else m.mask)
