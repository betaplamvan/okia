"""Luật Dots & Boxes — port 1:1 từ web/src/game/rules.ts theo docs/03.

Phải cho kết quả giống hệt bản TypeScript trên mọi fixture trong shared/fixtures/.
Trạng thái bất biến (frozen dataclass, tuple); apply_move trả về trạng thái mới.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Literal

Player = Literal[0, 1]
Owner = int  # VOID (-2) | -1 | 0 | 1
VOID = -2  # cạnh / ô không thuộc bàn (map hình thù: ngoài mặt nạ) — không bao giờ vẽ / ăn được
MoveErrorCode = Literal["GAME_OVER", "NOT_YOUR_TURN", "INVALID_EDGE", "EDGE_TAKEN"]


class MoveError(Exception):
    def __init__(self, code: MoveErrorCode) -> None:
        super().__init__(code)
        self.code: MoveErrorCode = code


@dataclass(frozen=True, slots=True)
class GameState:
    rows: int
    cols: int
    edges: tuple[Owner, ...]
    owners: tuple[Owner, ...]
    scores: tuple[int, int]
    turn: Player
    move_no: int
    finished: bool


# ---------- Đánh số cạnh / ô ----------


def horizontal_edge_count(rows: int, cols: int) -> int:
    return (rows + 1) * cols


def edge_count(rows: int, cols: int) -> int:
    return horizontal_edge_count(rows, cols) + rows * (cols + 1)


def horizontal_edge_id(cols: int, r: int, c: int) -> int:
    return r * cols + c


def vertical_edge_id(rows: int, cols: int, r: int, c: int) -> int:
    return horizontal_edge_count(rows, cols) + r * (cols + 1) + c


def box_id(cols: int, r: int, c: int) -> int:
    return r * cols + c


def box_edges(rows: int, cols: int, box: int) -> tuple[int, int, int, int]:
    """(top, bottom, left, right)."""
    r, c = divmod(box, cols)
    return (
        horizontal_edge_id(cols, r, c),
        horizontal_edge_id(cols, r + 1, c),
        vertical_edge_id(rows, cols, r, c),
        vertical_edge_id(rows, cols, r, c + 1),
    )


def edge_boxes(rows: int, cols: int, edge: int) -> list[int]:
    """Các ô kề một cạnh (1 hoặc 2 ô), tăng dần theo id ô."""
    h = horizontal_edge_count(rows, cols)
    boxes: list[int] = []
    if edge < h:
        r, c = divmod(edge, cols)
        if r > 0:
            boxes.append(box_id(cols, r - 1, c))
        if r < rows:
            boxes.append(box_id(cols, r, c))
    else:
        v = edge - h
        r, c = divmod(v, cols + 1)
        if c > 0:
            boxes.append(box_id(cols, r, c - 1))
        if c < cols:
            boxes.append(box_id(cols, r, c))
    return boxes


def edge_endpoints(rows: int, cols: int, edge: int) -> tuple[tuple[int, int], tuple[int, int]]:
    h = horizontal_edge_count(rows, cols)
    if edge < h:
        r, c = divmod(edge, cols)
        return (r, c), (r, c + 1)
    r, c = divmod(edge - h, cols + 1)
    return (r, c), (r + 1, c)


# ---------- Trạng thái ----------


def create_game(rows: int, cols: int, mask: Sequence[bool] | None = None) -> GameState:
    """Ván mới trên lưới R×C. `mask` (R×C, tùy chọn): ô nào thuộc bàn — map hình thù.

    Ô ngoài mặt nạ và cạnh không kề ô nào thuộc bàn mang giá trị VOID.
    """
    if rows < 1 or cols < 1:
        raise ValueError(f"Kích thước bàn không hợp lệ: {rows}x{cols}")
    if mask is not None and (len(mask) != rows * cols or not any(mask)):
        raise ValueError(f"Mặt nạ không hợp lệ cho bàn {rows}x{cols}")
    owners = [-1] * (rows * cols)
    edges = [-1] * edge_count(rows, cols)
    if mask is not None:
        owners = [-1 if mask[b] else VOID for b in range(rows * cols)]
        edges = [
            -1 if any(mask[b] for b in edge_boxes(rows, cols, e)) else VOID
            for e in range(len(edges))
        ]
    return GameState(
        rows=rows,
        cols=cols,
        edges=tuple(edges),
        owners=tuple(owners),
        scores=(0, 0),
        turn=0,
        move_no=0,
        finished=False,
    )


def playable_edge_count(state: GameState) -> int:
    """Số cạnh vẽ được (không tính VOID) = số nước của cả ván."""
    return sum(1 for e in state.edges if e != VOID)


def playable_box_count(state: GameState) -> int:
    return sum(1 for o in state.owners if o != VOID)


def live_boxes(state: GameState, edge: int) -> list[int]:
    """Các ô THUỘC BÀN kề một cạnh (bỏ ô VOID — ví dụ "lỗ" trong map hình thù)."""
    return [b for b in edge_boxes(state.rows, state.cols, edge) if state.owners[b] != VOID]


def box_side_count(state: GameState, box: int) -> int:
    """Số cạnh đã vẽ của ô (VOID không tính là đã vẽ)."""
    return sum(1 for e in box_edges(state.rows, state.cols, box) if state.edges[e] >= 0)


def legal_moves(state: GameState) -> list[int]:
    if state.finished:
        return []
    return [i for i, o in enumerate(state.edges) if o == -1]


def validate_move(state: GameState, player: int, edge: int) -> MoveErrorCode | None:
    if state.finished:
        return "GAME_OVER"
    if player != state.turn:
        return "NOT_YOUR_TURN"
    if not isinstance(edge, int) or edge < 0 or edge >= len(state.edges):
        return "INVALID_EDGE"
    if state.edges[edge] == VOID:
        return "INVALID_EDGE"
    if state.edges[edge] != -1:
        return "EDGE_TAKEN"
    return None


def apply_move(state: GameState, player: int, edge: int) -> tuple[GameState, list[int]]:
    """Áp dụng nước đi; trả (trạng thái mới, ô ăn được). Ném MoveError nếu không hợp lệ."""
    error = validate_move(state, player, edge)
    if error:
        raise MoveError(error)

    edges = list(state.edges)
    edges[edge] = player
    owners = list(state.owners)
    scores = list(state.scores)
    move_no = state.move_no + 1
    probe = replace(state, edges=tuple(edges), owners=tuple(owners), move_no=move_no)

    captured: list[int] = []
    for box in live_boxes(state, edge):
        if owners[box] == -1 and box_side_count(probe, box) == 4:
            owners[box] = player
            scores[player] += 1
            captured.append(box)

    finished = move_no == playable_edge_count(probe)
    turn: Player = player if captured else (1 if player == 0 else 0)  # type: ignore[assignment]
    new_state = GameState(
        rows=state.rows,
        cols=state.cols,
        edges=tuple(edges),
        owners=tuple(owners),
        scores=(scores[0], scores[1]),
        turn=turn,
        move_no=move_no,
        finished=finished,
    )
    return new_state, captured


def winner(state: GameState) -> Player | None:
    if not state.finished:
        raise ValueError("Ván chưa kết thúc")
    if state.scores[0] == state.scores[1]:
        return None
    return 0 if state.scores[0] > state.scores[1] else 1
