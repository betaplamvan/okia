"""Bể map (docs/03 — Map): bản chép maps.json khớp shared/, ràng buộc thiết kế, ván trọn vẹn."""

import json
import random
from pathlib import Path

import pytest

from app.game import maps, rules

SHARED = Path(__file__).resolve().parents[2] / "shared" / "maps" / "maps.json"


def test_ban_chep_khop_shared() -> None:
    """Sửa shared/maps/maps.json xong phải chạy `node web/scripts/gen-maps.mjs`."""
    shared = json.loads(SHARED.read_text(encoding="utf-8"))["maps"]
    copy = json.loads((Path(maps.__file__).with_name("maps.json")).read_text(encoding="utf-8"))
    assert copy["maps"] == shared


def test_be_map() -> None:
    ids = [m.id for m in maps.pool()]
    assert {"5x5", "7x7"} <= set(ids)
    assert sum(1 for m in maps.pool() if m.kind == "shape") >= 5
    assert "3x3" not in ids
    hidden = maps.get_map("3x3")
    assert hidden is not None and hidden.hidden


@pytest.mark.parametrize("m", list(maps.all_maps().values()), ids=lambda m: m.id)
def test_rang_buoc_thiet_ke(m: maps.GameMap) -> None:
    assert m.box_count % 2 == 1, "số ô phải lẻ để không thể hòa"
    assert "#" in m.cells[0] and "#" in m.cells[-1]
    assert any(row[0] == "#" for row in m.cells) and any(row[-1] == "#" for row in m.cells)
    start = m.mask.index(True)
    seen, stack = {start}, [start]
    while stack:
        r, c = divmod(stack.pop(), m.cols)
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            n = rr * m.cols + cc
            if 0 <= rr < m.rows and 0 <= cc < m.cols and m.mask[n] and n not in seen:
                seen.add(n)
                stack.append(n)
    assert len(seen) == m.box_count, "các ô phải liền nhau theo cạnh"


@pytest.mark.parametrize("m", maps.pool(), ids=lambda m: m.id)
def test_van_ngau_nhien_ket_thuc(m: maps.GameMap) -> None:
    rng = random.Random(7)
    state = maps.create_game(m)
    while not state.finished:
        state, _ = rules.apply_move(state, state.turn, rng.choice(rules.legal_moves(state)))
    assert state.move_no == rules.playable_edge_count(state)
    assert sum(state.scores) == m.box_count
    assert rules.winner(state) is not None


def test_resolve() -> None:
    assert maps.resolve("khung-long") is not None
    assert maps.resolve("khong-co") is None
    assert maps.resolve("3x3") is None
    assert maps.resolve("3x3", allow_hidden=True) is not None
    for _ in range(30):
        picked = maps.resolve(maps.RANDOM_MAP)
        assert picked is not None and not picked.hidden
