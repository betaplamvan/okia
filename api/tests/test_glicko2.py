"""Glicko-2 so với ví dụ trong paper của Glickman (2013) và vài tính chất cơ bản (docs/07)."""

import math

from app.rating import glicko2
from app.rating.glicko2 import Glicko


def test_vi_du_trong_paper() -> None:
    player = Glicko(1500, 200, 0.06)
    results = [
        (Glicko(1400, 30, 0.06), 1.0),
        (Glicko(1550, 100, 0.06), 0.0),
        (Glicko(1700, 300, 0.06), 0.0),
    ]
    new = glicko2.update(player, results)
    assert math.isclose(new.mmr, 1464.06, abs_tol=0.01)
    assert math.isclose(new.rd, 151.52, abs_tol=0.01)
    assert math.isclose(new.vol, 0.05999, abs_tol=0.00001)


def test_ky_vong_doi_xung_va_thang_tang_diem() -> None:
    a = Glicko(1500, 350, 0.06)
    b = Glicko(1500, 350, 0.06)
    assert glicko2.expected(a, b) == 0.5
    strong, sure = Glicko(1900, 50, 0.06), Glicko(1500, 50, 0.06)
    assert glicko2.expected(strong, sure) > 0.85
    # Đối thủ càng không chắc chắn (rd lớn) thì kỳ vọng càng gần 0.5.
    assert glicko2.expected(strong, a) < glicko2.expected(strong, sure)
    assert math.isclose(
        glicko2.expected(strong, sure) + glicko2.expected(sure, strong), 1.0, abs_tol=1e-9
    )
    win = glicko2.update(a, [(b, 1.0)])
    lose = glicko2.update(a, [(b, 0.0)])
    assert win.mmr > 1500 > lose.mmr
    assert win.rd < 350  # chắc chắn hơn sau mỗi trận


def test_nghi_lau_rd_tang_co_tran() -> None:
    g = Glicko(1600, 50, 0.06)
    assert glicko2.inflate(g, 0).rd == 50
    assert 50 < glicko2.inflate(g, 30).rd < 100
    assert glicko2.inflate(g, 100000).rd == 350
    # Kỳ không chơi: chỉ tăng rd, mmr giữ nguyên.
    idle = glicko2.update(g, [])
    assert idle.mmr == 1600 and idle.rd > 50
