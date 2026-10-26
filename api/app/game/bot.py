"""Bot phía server (docs/03 — Bot, P2-05): bản Python của web/src/game/bot.ts, cùng fixtures
tình huống `shared/fixtures/bot` (tests/test_bot.py).

Thuật toán: ăn ô → cạnh an toàn → nhường; lớp trên là tìm kiếm negamax + alpha-beta + bảng ghi
nhớ cho tàn cuộc và pha cuối an toàn, nhường đôi (bỏ lại 2 ô cuối chuỗi / 4 ô cuối vòng) để giữ
quyền kiểm soát. `strength ∈ [0, 1]`: xác suất dùng lớp tìm kiếm ở mỗi quyết định; nước ngớ ngẩn
chỉ khi strength < 0.6. Python chậm hơn JS nên ngân sách mặc định nhỏ hơn (4 000 nút / 120 ms).
"""

from __future__ import annotations

import random as _random
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from app.game import rules
from app.game.rules import GameState

DEFAULT_BUDGET = 4_000
DEFAULT_TIME_MS = 120
SAFE_SEARCH_MAX = 10
SAFE_DEPTH = 3


@dataclass
class MoveClasses:
    capturing: list[int] = field(default_factory=list)
    safe: list[int] = field(default_factory=list)
    risky: list[int] = field(default_factory=list)


def sides_of(state: GameState) -> list[int]:
    """Số cạnh đã vẽ của từng ô; ô VOID hoặc đã có chủ = -1."""
    return [
        rules.box_side_count(state, b) if state.owners[b] == -1 else -1
        for b in range(len(state.owners))
    ]


def classify_with(state: GameState, sides: list[int]) -> MoveClasses:
    out = MoveClasses()
    for edge, e in enumerate(state.edges):
        if e != -1:
            continue
        mx = -1
        for box in rules.live_boxes(state, edge):
            if sides[box] > mx:
                mx = sides[box]
        if mx == 3:
            out.capturing.append(edge)
        elif mx <= 1:
            out.safe.append(edge)
        else:
            out.risky.append(edge)
    return out


def classify_moves(state: GameState) -> MoveClasses:
    if state.finished:
        return MoveClasses()
    return classify_with(state, sides_of(state))


def capture_count(state: GameState, edge: int) -> int:
    n = 0
    for box in rules.live_boxes(state, edge):
        if state.owners[box] == -1 and rules.box_side_count(state, box) == 3:
            n += 1
    return n


def capture_walk(
    state: GameState, sides0: list[int], drawn: set[int], start_edges: list[int]
) -> list[int]:
    """Mô phỏng ăn tham lam không tạo GameState: vẽ `start_edges` rồi ăn mọi ô lên 4 cạnh, mỗi ô
    ăn xong vẽ tiếp cạnh còn thiếu của ô kề… Trả các ô ăn được. `start_edges` rỗng = ăn những ô
    đang 3 cạnh."""
    sides = list(sides0)
    taken: list[int] = []
    ripe: list[int] = []

    def draw(edge: int) -> None:
        drawn.add(edge)
        for box in rules.live_boxes(state, edge):
            if sides[box] < 0:
                continue
            sides[box] += 1
            if sides[box] == 4:
                sides[box] = -1
                taken.append(box)
            elif sides[box] == 3:
                ripe.append(box)

    for e in start_edges:
        draw(e)
    if not start_edges:
        ripe.extend(b for b, s in enumerate(sides) if s == 3)
    while ripe:
        box = ripe.pop()
        if sides[box] != 3:
            continue
        missing = next(
            (
                x
                for x in rules.box_edges(state.rows, state.cols, box)
                if state.edges[x] == -1 and x not in drawn
            ),
            None,
        )
        if missing is None:
            continue
        draw(missing)
    return taken


def gift_boxes(state: GameState, edge: int) -> list[int]:
    if state.edges[edge] != -1:
        return []
    sides = sides_of(state)
    for box in rules.live_boxes(state, edge):
        if sides[box] == 3:
            return []
    return capture_walk(state, sides, set(), [edge])


def gift_size(state: GameState, edge: int) -> float:
    if state.edges[edge] != -1:
        return float("inf")
    return float(len(gift_boxes(state, edge)))


def _pick(arr: list[int], random: Callable[[], float]) -> int:
    return arr[min(len(arr) - 1, int(random() * len(arr)))]


# ---------- Tìm kiếm ----------


class BudgetExceeded(Exception):
    pass


@dataclass
class Ctx:
    nodes: int
    budget: int
    deadline: float
    tt: dict[tuple[int, int, int], tuple[int, int]] = field(default_factory=dict)


def _key(state: GameState) -> tuple[int, int]:
    mask = 0
    for i, e in enumerate(state.edges):
        if e != -1:
            mask |= 1 << i
    return (mask, state.turn)


def candidates(state: GameState, sides: list[int], classes: MoveClasses) -> list[int]:
    """Nước đáng xét (cắt tỉa như bot.ts: ăn + nhường đôi; cạnh an toàn; gom cạnh cùng chuỗi)."""
    capturing, safe, risky = classes.capturing, classes.safe, classes.risky
    if capturing:
        best = capturing[0]
        best_n = 0
        for e in capturing:
            n = capture_count(state, e)
            if n > best_n:
                best_n, best = n, e
        out = [best]
        if not safe and risky:
            ripe = set(capture_walk(state, sides, set(), []))
            for e in risky:
                gift = capture_walk(state, sides, set(), [e])
                if gift and all(b in ripe for b in gift):
                    out.append(e)
        return out
    if safe:
        return list(safe)
    groups: dict[tuple[int, ...], list[int]] = {}
    for e in risky:
        k = tuple(sorted(capture_walk(state, sides, set(), [e])))
        groups.setdefault(k, []).append(e)
    out = []
    for g in groups.values():
        out.append(g[0])
        if len(g) > 2:
            out.append(g[len(g) // 2])
    return out


def _search(state: GameState, alpha: float, beta: float, depth: int, ctx: Ctx) -> float:
    if state.finished:
        return 0.0
    ctx.nodes += 1
    if ctx.nodes > ctx.budget:
        raise BudgetExceeded
    if ctx.nodes & 127 == 0 and time.monotonic() > ctx.deadline:
        raise BudgetExceeded
    mask, turn = _key(state)
    key = (mask, turn, depth)
    hit = ctx.tt.get(key)
    if hit is not None:
        v, kind = hit
        if kind == 0:
            return v
        if kind == 1 and v >= beta:
            return v
        if kind == 2 and v <= alpha:
            return v
    sides = sides_of(state)
    classes = classify_with(state, sides)
    safe_phase = not classes.capturing and bool(classes.safe)
    if safe_phase and depth == 0:
        return 0.0
    alpha0 = alpha
    best = float("-inf")
    for edge in candidates(state, sides, classes):
        try:
            nxt, captured = rules.apply_move(state, state.turn, edge)
        except rules.MoveError:
            continue
        gain = len(captured)
        d = depth - 1 if safe_phase else depth
        if nxt.turn == state.turn:
            v = gain + _search(nxt, alpha - gain, beta - gain, d, ctx)
        else:
            v = gain - _search(nxt, gain - beta, gain - alpha, d, ctx)
        if v > best:
            best = v
        if v > alpha:
            alpha = v
        if alpha >= beta:
            break
    if best == float("-inf"):
        return 0.0
    ctx.tt[key] = (int(best), 2 if best <= alpha0 else 1 if best >= beta else 0)
    return best


@dataclass
class SearchResult:
    edge: int
    value: float
    ties: list[int]


def search_best(
    state: GameState,
    moves: list[int],
    budget: int = DEFAULT_BUDGET,
    depth: int = SAFE_DEPTH,
    time_ms: int = DEFAULT_TIME_MS,
) -> SearchResult | None:
    """Nước tốt nhất theo tìm kiếm trong ngân sách; None nếu quá ngân sách."""
    if budget <= 0 or not moves:
        return None
    ctx = Ctx(nodes=0, budget=budget, deadline=time.monotonic() + time_ms / 1000)
    scored: list[tuple[int, float]] = []
    try:
        for edge in moves:
            try:
                nxt, captured = rules.apply_move(state, state.turn, edge)
            except rules.MoveError:
                continue
            gain = len(captured)
            inf = float("inf")
            if nxt.turn == state.turn:
                v = gain + _search(nxt, -inf, inf, depth, ctx)
            else:
                v = gain - _search(nxt, -inf, inf, depth, ctx)
            scored.append((edge, v))
    except BudgetExceeded:
        return None
    if not scored:
        return None
    value = max(v for _, v in scored)
    ties = [e for e, v in scored if v == value]
    return SearchResult(edge=ties[0], value=value, ties=ties)


def _break_ties(state: GameState, ties: list[int], random: Callable[[], float]) -> int:
    capt = [e for e in ties if capture_count(state, e) > 0]
    if capt:
        return _pick(capt, random)
    gifts = [gift_size(state, e) for e in ties]
    mn = min(gifts)
    return _pick([e for e, g in zip(ties, gifts, strict=True) if g == mn], random)


# ---------- Chọn nước ----------


def choose_move_greedy(state: GameState, random: Callable[[], float] | None = None) -> int:
    """Bot cũ (P0-17): ăn ô → cạnh an toàn → nhường chuỗi ngắn nhất."""
    random = random or _random.random
    legal = rules.legal_moves(state)
    if not legal:
        raise ValueError("Ván đã kết thúc, không còn nước đi")
    c = classify_moves(state)
    if c.capturing:
        best = max(capture_count(state, e) for e in c.capturing)
        return _pick([e for e in c.capturing if capture_count(state, e) == best], random)
    if c.safe:
        return _pick(c.safe, random)
    if c.risky:
        gifts = [gift_size(state, e) for e in c.risky]
        mn = min(gifts)
        return _pick([e for e, g in zip(c.risky, gifts, strict=True) if g == mn], random)
    return _pick(legal, random)


def choose_move(
    state: GameState,
    *,
    strength: float = 0.8,
    random: Callable[[], float] | None = None,
    search_budget: int = DEFAULT_BUDGET,
    search_time_ms: int = DEFAULT_TIME_MS,
) -> int:
    """Chọn nước cho người đang có lượt. Mô hình lỗi như bot.ts (docs/03)."""
    random = random or _random.random
    legal = rules.legal_moves(state)
    if not legal:
        raise ValueError("Ván đã kết thúc, không còn nước đi")
    strength = min(1.0, max(0.0, strength))
    blunder_p = max(0.0, 0.6 - strength) / 2

    def lazy() -> bool:
        return random() > strength

    def blunder() -> bool:
        return blunder_p > 0 and random() < blunder_p

    sides = sides_of(state)
    classes = classify_with(state, sides)
    capturing, safe, risky = classes.capturing, classes.safe, classes.risky

    if capturing:
        if blunder():
            return _pick(legal, random)
        if not safe and not lazy():
            found = search_best(
                state, candidates(state, sides, classes), search_budget, SAFE_DEPTH, search_time_ms
            )
            if found:
                return _break_ties(state, found.ties, random)
        best = max(capture_count(state, e) for e in capturing)
        return _pick([e for e in capturing if capture_count(state, e) == best], random)

    if safe:
        if blunder():
            return _pick(legal, random)
        if len(safe) <= SAFE_SEARCH_MAX and not lazy():
            found = search_best(state, safe, search_budget, SAFE_DEPTH, search_time_ms)
            if found:
                return _pick(found.ties, random)
        return _pick(safe, random)

    if risky:
        if blunder():
            return _pick(risky, random)
        if not lazy():
            found = search_best(
                state, candidates(state, sides, classes), search_budget, SAFE_DEPTH, search_time_ms
            )
            if found:
                return _break_ties(state, found.ties, random)
        gifts = [gift_size(state, e) for e in risky]
        mn = min(gifts)
        return _pick([e for e, g in zip(risky, gifts, strict=True) if g == mn], random)

    return _pick(legal, random)


# Mốc (MMR ẩn, độ mạnh) — nội suy tuyến tính giữa các mốc, kẹp hai đầu (2026-10-26: người mới
# 1500 / rd 350 gặp máy 0,3 thay vì 0,65 — trước đó người mới thua máy liên tục).
STRENGTH_BY_MMR: tuple[tuple[float, float], ...] = (
    (1100.0, 0.15),
    (1500.0, 0.35),
    (1700.0, 0.65),
    (1900.0, 0.95),
)
# Rating chưa chắc (rd cao: người mới, lâu không chơi) → kéo về mức dễ này.
UNSURE_STRENGTH = 0.3


def strength_for_rating(mmr: float, rd: float = 350.0) -> float:
    """Độ mạnh máy khi ghép trận theo **rating ẩn** (docs/07 — Ghép máy, docs/03 — Tự điều chỉnh).

    Nội suy theo STRENGTH_BY_MMR: MMR ≤ 1100 → 0,15 · 1500 (mặc định) → 0,35 · 1700 → 0,65 ·
    ≥ 1900 → 0,95. Rating chưa chắc (rd ≥ 200) kéo dần về UNSURE_STRENGTH (rd 350 = người mới hoàn
    toàn → 0,3) để người mới bắt đầu không gặp máy quá khó. Không dùng bậc rank hiển thị vì điểm
    hạng tăng theo số ván chơi, không chỉ theo trình độ.
    """
    pts = STRENGTH_BY_MMR
    if mmr <= pts[0][0]:
        base = pts[0][1]
    elif mmr >= pts[-1][0]:
        base = pts[-1][1]
    else:
        base = pts[-1][1]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:], strict=False):
            if x0 <= mmr <= x1:
                base = y0 + (y1 - y0) * (mmr - x0) / (x1 - x0)
                break
    trust = 1.0 - min(1.0, max(0.0, (rd - 200.0) / 150.0))
    return round(UNSURE_STRENGTH + (base - UNSURE_STRENGTH) * trust, 2)
