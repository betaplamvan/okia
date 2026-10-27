"""Điểm hạng hiển thị (ADR-0012): thứ người chơi nhìn thấy và leo. Tách khỏi rating ẩn.

- Thắng/thua cộng/trừ theo kỳ vọng thắng (từ rating ẩn, nén một nửa về 50/50) nhân với "tiền cược"
  của trận: trận cân (chênh ≤ FAIR_GAP) cược đủ; trận lệch (ghép khi vắng người / chờ lâu) cược
  giảm dần tới MIN_STAKE. Không bao giờ âm; tối thiểu ±1 mỗi trận.
- Hệ số theo hạng hiện tại (TIER_MULT): hạng thấp thắng được nhiều hơn, thua mất ít (người mới
  leo được); hạng cao thua mất nhiều hơn (lên Thủ khoa phải thắng nhiều hơn thua, không chỉ cày).
- Thắng liền từ trận thứ STREAK_FROM: cộng thêm STREAK_BONUS.
- Chỉnh lại 2026-10-27: bộ cũ (+24/−16, không hệ số hạng) cần ~75 trận cân 50 % để qua một hạng
  → mọi người kẹt ở Giấy nháp; thêm nữa rating ẩn của người mới dao động mạnh (rd 350) làm trận
  lệch giả → chỉ ±1.
- Hạng/bậc tính thẳng từ điểm: mỗi hạng TIER_SIZE điểm, chia 3 bậc (III → I); Thủ khoa không có bậc.
- PLACEMENT_GAMES trận đầu mùa chưa hiện hạng.
"""

from __future__ import annotations

from dataclasses import dataclass

TIERS: tuple[str, ...] = ("scratch", "notebook", "good", "honor", "valedictorian")
# Danh hiệu trên Thủ khoa: TOP_TITLE_LIMIT Thủ khoa nhiều điểm nhất trên BXH (tính theo vị trí,
# không theo điểm) — "Trạng nguyên". Không phải hạng theo điểm; gán khi trả kết quả.
TOP_TITLE = "topscholar"
TOP_TITLE_LIMIT = 100
TIER_SIZE = 300
DIVISION_SIZE = 100
PLACEMENT_GAMES = 5

# Mặc định; admin chỉnh được (rank_win_points, rank_loss_points, rank_streak_bonus,
# rank_bot_stake_pct — service.rank_tuning()).
WIN_BASE = 30  # thắng trận cân 50/50, hệ số hạng 1
LOSS_BASE = 20  # thua trận cân 50/50, hệ số hạng 1
STREAK_FROM = 3  # thắng liền từ trận thứ mấy thì có thưởng chuỗi
STREAK_BONUS = 5
BOT_STAKE_PCT = 75  # trận với máy: % so với trận cân với người
# Kỳ vọng thắng chỉ ảnh hưởng một nửa: hệ số thắng 2(1 − E') trong [0,5; 1,5] — rating ẩn của người
# mới dao động mạnh, để nguyên thì người yếu thắng một trận "bất ngờ" được gấp đôi điểm.
E_WEIGHT = 0.5
FAIR_GAP = 250.0  # chênh mmr ≤ ngưỡng này: cược đủ
MAX_GAP = 600.0  # chênh ≥ ngưỡng này: cược MIN_STAKE
MIN_STAKE = 0.25
# Hạng (theo điểm trước trận) → (hệ số điểm thắng, hệ số điểm thua).
TIER_MULT: dict[str, tuple[float, float]] = {
    "scratch": (1.5, 0.4),
    "notebook": (1.2, 0.7),
    "good": (1.0, 1.0),
    "honor": (1.0, 1.2),
    "valedictorian": (1.0, 1.4),
}


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
    if tier == TOP_TITLE:
        return len(TIERS) * TIER_SIZE
    return TIERS.index(tier) * TIER_SIZE


def with_top_title(rank: Rank | None, position: int | None) -> Rank | None:
    """Thủ khoa đứng trong top TOP_TITLE_LIMIT của BXH → danh hiệu Trạng nguyên."""
    if rank is None or rank.tier != "valedictorian" or position is None:
        return rank
    if position <= TOP_TITLE_LIMIT:
        return Rank(TOP_TITLE, None, rank.points)
    return rank


def stake(gap: float) -> float:
    """Tiền cược theo chênh lệch rating ẩn: 1 khi cân, giảm tuyến tính tới MIN_STAKE."""
    g = min(1.0, max(0.0, (abs(gap) - FAIR_GAP) / (MAX_GAP - FAIR_GAP)))
    return 1.0 - (1.0 - MIN_STAKE) * g


def delta(
    expected: float,
    score: float,
    gap: float,
    *,
    points: int = 0,
    streak: int = 0,
    mult: float = 1.0,
    win_base: int = WIN_BASE,
    loss_base: int = LOSS_BASE,
    streak_bonus: int = STREAK_BONUS,
) -> int:
    """Điểm cộng/trừ cho một người: `expected` = kỳ vọng thắng, `score` 1/0.5/0, `gap` = chênh
    lệch mmr ẩn giữa hai người, `points` / `streak` = điểm hạng và chuỗi thắng **trước** trận,
    `mult` = hệ số thêm (trận với máy)."""
    e = 0.5 + (expected - 0.5) * E_WEIGHT
    s = stake(gap) * mult
    win_mult, loss_mult = TIER_MULT[rank_of(points).tier]
    if score >= 1.0:
        bonus = streak_bonus if streak + 1 >= STREAK_FROM else 0
        return max(1, round(win_base * 2 * (1.0 - e) * s * win_mult)) + bonus
    if score <= 0.0:
        return -max(1, round(loss_base * 2 * e * s * loss_mult))
    return round((0.5 - e) * (win_base + loss_base) * s)


def apply(points: int, change: int) -> int:
    return max(0, points + change)
