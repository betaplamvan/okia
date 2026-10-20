"""Chạy toàn bộ shared/fixtures/*.json (cùng bộ với Vitest) + tính chất tổng quát."""

import json
import random
from pathlib import Path

import pytest

from app.game.rules import (
    MoveError,
    apply_move,
    box_edges,
    create_game,
    edge_boxes,
    edge_count,
    edge_endpoints,
    legal_moves,
    winner,
)

FIXTURES = sorted((Path(__file__).resolve().parents[2] / "shared" / "fixtures").glob("*.json"))


@pytest.mark.parametrize("path", FIXTURES, ids=[p.name for p in FIXTURES])
def test_fixture(path: Path) -> None:
    fx = json.loads(path.read_text(encoding="utf-8"))
    mask = [ch == "#" for row in fx["cells"] for ch in row] if "cells" in fx else None
    state = create_game(fx["rows"], fx["cols"], mask)
    for i, mv in enumerate(fx["moves"], start=1):
        label = f"nước #{i} (p{mv['player']} cạnh {mv['edge']})"
        if "expectError" in mv:
            with pytest.raises(MoveError) as ei:
                apply_move(state, mv["player"], mv["edge"])
            assert ei.value.code == mv["expectError"], label
            continue
        state, captured = apply_move(state, mv["player"], mv["edge"])
        if "expectCaptured" in mv:
            assert captured == mv["expectCaptured"], label
    exp = fx["expect"]
    assert list(state.scores) == exp["scores"]
    assert state.turn == exp["turn"]
    assert state.finished == exp["finished"]
    if "moveNo" in exp:
        assert state.move_no == exp["moveNo"]
    if "owners" in exp:
        assert list(state.owners) == exp["owners"]
    if "winner" in exp:
        assert winner(state) == exp["winner"]


def test_fixtures_ton_tai() -> None:
    assert len(FIXTURES) >= 6


@pytest.mark.parametrize(
    ("rows", "cols", "expected"),
    [(1, 1, 4), (2, 2, 12), (3, 3, 24), (5, 5, 60), (7, 7, 112), (2, 3, 17)],
)
def test_edge_count(rows: int, cols: int, expected: int) -> None:
    assert edge_count(rows, cols) == expected


def test_danh_so_nhat_quan() -> None:
    for rows, cols in [(1, 1), (2, 3), (5, 5)]:
        for box in range(rows * cols):
            for e in box_edges(rows, cols, box):
                assert box in edge_boxes(rows, cols, e)
        for e in range(edge_count(rows, cols)):
            boxes = edge_boxes(rows, cols, e)
            assert 1 <= len(boxes) <= 2 and boxes == sorted(boxes)
            (r1, c1), (r2, c2) = edge_endpoints(rows, cols, e)
            assert abs(r1 - r2) + abs(c1 - c2) == 1


def test_vi_du_2x2_docs() -> None:
    assert box_edges(2, 2, 0) == (0, 2, 6, 7)
    assert box_edges(2, 2, 3) == (3, 5, 10, 11)
    assert edge_boxes(2, 2, 2) == [0, 2]
    assert edge_boxes(2, 2, 7) == [0, 1]
    assert edge_boxes(2, 2, 11) == [3]


@pytest.mark.parametrize(("rows", "cols"), [(1, 1), (2, 2), (3, 3), (4, 4), (5, 5)])
def test_van_ngau_nhien(rows: int, cols: int) -> None:
    for seed in range(1, 6):
        rng = random.Random(seed)
        state = create_game(rows, cols)
        while not state.finished:
            before = state
            edge = rng.choice(legal_moves(state))
            state, captured = apply_move(state, state.turn, edge)
            assert state.turn == (before.turn if captured else 1 - before.turn)
            assert before.move_no + 1 == state.move_no
        assert state.move_no == edge_count(rows, cols)
        assert sum(state.scores) == rows * cols
        assert all(o != -1 for o in state.owners)
        assert legal_moves(state) == []
        if (rows * cols) % 2 == 1:
            assert winner(state) is not None


def test_create_game_tu_choi_kich_thuoc_sai() -> None:
    with pytest.raises(ValueError):
        create_game(0, 2)
