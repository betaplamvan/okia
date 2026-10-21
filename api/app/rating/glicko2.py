"""Glicko-2 (Glickman, 2013) — rating ẩn `mmr/rd/vol`, chỉ dùng để ghép trận và tính kỳ vọng thắng.

Mỗi trận là một kỳ đánh giá (một đối thủ). Thang nội bộ μ/φ/σ; `SCALE` đổi sang thang 1500/350.
Test so với ví dụ trong paper gốc: tests/test_glicko2.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

SCALE = 173.7178
TAU = 0.5  # hằng số hệ thống (docs/07)
EPS = 1e-6
DEFAULT_MMR = 1500.0
DEFAULT_RD = 350.0
DEFAULT_VOL = 0.06
MAX_RD = 350.0


@dataclass(frozen=True, slots=True)
class Glicko:
    mmr: float = DEFAULT_MMR
    rd: float = DEFAULT_RD
    vol: float = DEFAULT_VOL

    @property
    def mu(self) -> float:
        return (self.mmr - DEFAULT_MMR) / SCALE

    @property
    def phi(self) -> float:
        return self.rd / SCALE


def _g(phi: float) -> float:
    return 1.0 / math.sqrt(1.0 + 3.0 * phi * phi / (math.pi * math.pi))


def expected(player: Glicko, opponent: Glicko) -> float:
    """Xác suất thắng kỳ vọng của `player` (đã kể độ không chắc chắn của đối thủ)."""
    return 1.0 / (1.0 + math.exp(-_g(opponent.phi) * (player.mu - opponent.mu)))


def inflate(player: Glicko, idle_periods: float) -> Glicko:
    """Nghỉ lâu → rd tăng (mỗi kỳ nghỉ cộng σ² vào φ²), trần 350 (docs/07)."""
    if idle_periods <= 0:
        return player
    phi = math.sqrt(player.phi**2 + player.vol**2 * idle_periods)
    return Glicko(player.mmr, min(MAX_RD, phi * SCALE), player.vol)


def update(player: Glicko, results: list[tuple[Glicko, float]], tau: float = TAU) -> Glicko:
    """Cập nhật sau một kỳ với danh sách (đối thủ, kết quả 1/0.5/0). Rỗng → chỉ tăng rd."""
    mu, phi, sigma = player.mu, player.phi, player.vol
    if not results:
        return Glicko(player.mmr, min(MAX_RD, math.sqrt(phi**2 + sigma**2) * SCALE), sigma)

    v_inv = 0.0
    delta_sum = 0.0
    for opp, score in results:
        g = _g(opp.phi)
        e = 1.0 / (1.0 + math.exp(-g * (mu - opp.mu)))
        v_inv += g * g * e * (1.0 - e)
        delta_sum += g * (score - e)
    v = 1.0 / v_inv
    delta = v * delta_sum

    # Bước 5: σ' bằng thuật toán Illinois (tìm nghiệm f(x) = 0).
    a = math.log(sigma * sigma)
    phi2 = phi * phi
    d2 = delta * delta

    def f(x: float) -> float:
        ex = math.exp(x)
        return (ex * (d2 - phi2 - v - ex)) / (2.0 * (phi2 + v + ex) ** 2) - (x - a) / (tau * tau)

    big_a = a
    if d2 > phi2 + v:
        big_b = math.log(d2 - phi2 - v)
    else:
        k = 1
        while f(a - k * tau) < 0:
            k += 1
        big_b = a - k * tau
    fa, fb = f(big_a), f(big_b)
    while abs(big_b - big_a) > EPS:
        c = big_a + (big_a - big_b) * fa / (fb - fa)
        fc = f(c)
        if fc * fb <= 0:
            big_a, fa = big_b, fb
        else:
            fa /= 2.0
        big_b, fb = c, fc
    sigma_new = math.exp(big_a / 2.0)

    phi_star = math.sqrt(phi2 + sigma_new * sigma_new)
    phi_new = 1.0 / math.sqrt(1.0 / (phi_star * phi_star) + 1.0 / v)
    mu_new = mu + phi_new * phi_new * delta_sum
    return Glicko(
        mmr=DEFAULT_MMR + mu_new * SCALE,
        rd=min(MAX_RD, phi_new * SCALE),
        vol=sigma_new,
    )
