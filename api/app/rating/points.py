"""Điểm hạng hiển thị (ADR-0012): thứ người chơi nhìn thấy và leo. Tách khỏi rating ẩn.

- Thắng/thua cộng/trừ theo kỳ vọng thắng (từ rating ẩn) nhân với "tiền cược" của trận: trận cân
  (chênh ≤ FAIR_GAP) cược đủ; trận lệch (ghép khi vắng người / chờ lâu) cược giảm dần tới
  MIN_STAKE, nên có thể chỉ ±1. Không bao giờ âm; tối thiểu ±1 mỗi trận.
- Hạng/bậc tính thẳng từ điểm: mỗi hạng TIER_SIZE điểm, chia 3 bậc (III → I); Thủ khoa không có bậc.
- PLACEMENT_GAMES trận đầu mùa chưa hiện hạng.
"""

from __future__ import annotations

from dataclasses import dataclass

TIERS: tuple[str, ...] = ("scratch", "notebook", "good", "honor", "valedictorian")
TIER_SIZE = 300
DIVISION_SIZE = 100
PLACEMENT_GAMES = 5

WIN_BASE = 24  # thắng trận cân 50/50
LOSS_BASE = 16  # thua trận cân 50/50
WIN_CAP = 40
LOSS_CAP = 30
FAIR_GAP = 150.0  # chênh mmr ≤ ngưỡng này: cược đủ
MAX_GAP = 500.0  # chênh ≥ ngưỡng này: cược MIN_STAKE
MIN_STAKE = 0.1


@dataclass(frozen=True, slots=True)
class Rank:
    tier: str
    division: int | None  # 3 = III (thấp nhất) … 1 = I; None với Thủ khoa
    points: int

    def to_dict(self) -> dict[str, object]:
        return {"tier": self.tier, "division": self.division, "points": self.points}


def rank_of(points: int) -> Rank:
    idx = min(points // TIER_SIZE, len(TIERS) - 1)
    if idx == len(TIERS) - 1:
        return Rank(TIERS[idx], None, points)
    within = points - idx * TIER_SIZE
    return Rank(TIERS[idx], 3 - within // DIVISION_SIZE, points)


def tier_floor(tier: str) -> int:
    return TIERS.index(tier) * TIER_SIZE


def stake(gap: float) -> float:
    """Tiền cược theo chênh lệch rating ẩn: 1 khi cân, giảm tuyến tính tới MIN_STAKE."""
    g = min(1.0, max(0.0, (abs(gap) - FAIR_GAP) / (MAX_GAP - FAIR_GAP)))
    return 1.0 - (1.0 - MIN_STAKE) * g


def delta(expected: float, score: float, gap: float) -> int:
    """Điểm cộng/trừ cho một người: `expected` = kỳ vọng thắng, `score` 1/0.5/0,
    `gap` = chênh lệch mmr ẩn giữa hai người."""
    s = stake(gap)
    if score >= 1.0:
        return max(1, min(WIN_CAP, round(WIN_BASE * 2 * (1.0 - expected) * s)))
    if score <= 0.0:
        return -max(1, min(LOSS_CAP, round(LOSS_BASE * 2 * expected * s)))
    return round((0.5 - expected) * (WIN_BASE + LOSS_BASE) * s)


def apply(points: int, change: int) -> int:
    return max(0, points + change)
