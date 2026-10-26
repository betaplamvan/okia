"""Bot server (docs/03 — Bot, P2-05): fixtures tình huống dùng chung với bot.ts, nhường đôi,
tính hợp lệ, thắng bot tham lam."""

import json
import time
from pathlib import Path

import pytest

from app.game import bot, maps, rules

FIXTURES = sorted((Path(__file__).parents[2] / "shared" / "fixtures" / "bot").glob("*.json"))


def mulberry32(seed: int):  # type: ignore[no-untyped-def]
    a = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def play(state: rules.GameState, moves: list[tuple[int, int]]) -> rules.GameState:
    for p, e in moves:
        state, _ = rules.apply_move(state, p, e)
    return state


@pytest.mark.parametrize("path", FIXTURES, ids=[p.name for p in FIXTURES])
def test_fixtures_tinh_huong(path: Path) -> None:
    fx = json.loads(path.read_text(encoding="utf-8"))
    state = play(
        rules.create_game(fx["rows"], fx["cols"]), [(m["player"], m["edge"]) for m in fx["moves"]]
    )
    for seed in range(1, 21):
        edge = bot.choose_move(state, strength=1.0, random=mulberry32(seed))
        assert edge in fx["acceptable"], f"seed {seed} chọn cạnh {edge}"


def test_nhuong_doi_2x3() -> None:
    # Giống bot.test.ts: hàng trên chuỗi 3 ô mở ở ô 0, hàng dưới chuỗi 3 ô kín.
    state = play(
        rules.create_game(2, 3),
        [(0, 0), (1, 1), (0, 2), (1, 3), (0, 4), (1, 5), (0, 6), (1, 7), (0, 8), (1, 9)],
    )
    assert state.turn == 0
    never = lambda: 0.0  # noqa: E731
    assert bot.choose_move(state, strength=1.0, random=never) == 10
    state = play(state, [(0, 10)])
    assert bot.choose_move(state, strength=1.0, random=never) == 12


def test_luon_hop_le_moi_strength_va_map_hinh_thu() -> None:
    for strength in (0.0, 0.5, 1.0):
        rnd = mulberry32(int(strength * 10) + 3)
        for map_id in ("3x3", "khung-long"):
            game_map = maps.resolve(map_id, allow_hidden=True)
            assert game_map is not None
            state = maps.create_game(game_map)
            while not state.finished:
                edge = bot.choose_move(state, strength=strength, random=rnd)
                assert edge in rules.legal_moves(state)
                state, _ = rules.apply_move(state, state.turn, edge)


def test_bot_moi_thang_bot_tham_lam_va_dung_ngan_sach() -> None:
    wins = draws = 0
    games = 6
    worst = 0.0
    for g in range(games):
        rnd = mulberry32(100 + g)
        seat = g % 2
        state = rules.create_game(5, 5)
        while not state.finished:
            if state.turn == seat:
                t0 = time.perf_counter()
                edge = bot.choose_move(state, strength=1.0, random=rnd)
                worst = max(worst, time.perf_counter() - t0)
            else:
                edge = bot.choose_move_greedy(state, rnd)
            state, _ = rules.apply_move(state, state.turn, edge)
        diff = state.scores[seat] - state.scores[1 - seat]
        if diff > 0:
            wins += 1
        elif diff == 0:
            draws += 1
    assert wins + draws / 2 >= games * 0.75, f"thắng {wins}, hòa {draws} / {games}"
    assert worst < 0.6, f"một nước mất {worst:.2f}s"


def test_strength_theo_rating_an() -> None:
    """2026-10-26: người mới gặp máy dễ (0,3), tăng dần theo MMR thật (docs/03, docs/07)."""
    assert bot.strength_for_rating(1500, 350) == 0.3  # mới hoàn toàn: chưa tin rating
    assert bot.strength_for_rating(1000, 60) == 0.15
    assert bot.strength_for_rating(1500, 60) == 0.35
    assert bot.strength_for_rating(1600, 60) == 0.5
    assert bot.strength_for_rating(1700, 60) == 0.65
    assert bot.strength_for_rating(2000, 60) == 0.95
    assert bot.strength_for_rating(1900, 260) == 0.69  # tin 60 %: 0,3 + 0,65 × 0,6
    # Tăng dần theo MMR (không bao giờ khó hơn khi MMR thấp hơn).
    vals = [bot.strength_for_rating(m, 60) for m in range(1000, 2001, 50)]
    assert vals == sorted(vals)
