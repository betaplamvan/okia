/**
 * Luật Dots & Boxes — nguồn chuẩn: docs/03-luat-choi.md.
 * Phải cho kết quả giống hệt api/app/game/rules.py trên mọi fixture trong shared/fixtures/.
 *
 * Thuần TypeScript, không phụ thuộc gì; chỉ dùng cú pháp "erasable" để Node chạy trực tiếp.
 */

export type Player = 0 | 1;
/** -1: chưa ai; 0 | 1: chỉ số người chơi. */
export type Owner = -1 | Player;
/** Cạnh / ô không thuộc bàn (map hình thù: ngoài mặt nạ). Không bao giờ vẽ / ăn được. */
export const VOID = -2;
export type Slot = Owner | typeof VOID;

export interface GameState {
  readonly rows: number;
  readonly cols: number;
  /** E phần tử: người vẽ cạnh, -1 (chưa vẽ) hoặc VOID (không thuộc bàn). */
  readonly edges: readonly Slot[];
  /** R×C phần tử: chủ ô, -1 (chưa ai) hoặc VOID (ô ngoài mặt nạ). */
  readonly owners: readonly Slot[];
  readonly scores: readonly [number, number];
  readonly turn: Player;
  readonly moveNo: number;
  readonly finished: boolean;
}

export type MoveErrorCode = "GAME_OVER" | "NOT_YOUR_TURN" | "INVALID_EDGE" | "EDGE_TAKEN";

export type ApplyMoveResult =
  { ok: true; state: GameState; captured: number[] } | { ok: false; error: MoveErrorCode };

// ---------- Đánh số cạnh / ô ----------

export function horizontalEdgeCount(rows: number, cols: number): number {
  return (rows + 1) * cols;
}

export function edgeCount(rows: number, cols: number): number {
  return horizontalEdgeCount(rows, cols) + rows * (cols + 1);
}

/** Cạnh ngang nối chấm (r,c)–(r,c+1); r ∈ [0,R], c ∈ [0,C). */
export function horizontalEdgeId(cols: number, r: number, c: number): number {
  return r * cols + c;
}

/** Cạnh dọc nối chấm (r,c)–(r+1,c); r ∈ [0,R), c ∈ [0,C]. */
export function verticalEdgeId(rows: number, cols: number, r: number, c: number): number {
  return horizontalEdgeCount(rows, cols) + r * (cols + 1) + c;
}

export function boxId(cols: number, r: number, c: number): number {
  return r * cols + c;
}

export interface BoxEdges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function boxEdges(rows: number, cols: number, box: number): BoxEdges {
  const r = Math.floor(box / cols);
  const c = box % cols;
  return {
    top: horizontalEdgeId(cols, r, c),
    bottom: horizontalEdgeId(cols, r + 1, c),
    left: verticalEdgeId(rows, cols, r, c),
    right: verticalEdgeId(rows, cols, r, c + 1),
  };
}

/** Các ô kề một cạnh (1 hoặc 2 ô), sắp tăng dần theo id ô. */
export function edgeBoxes(rows: number, cols: number, edge: number): number[] {
  const h = horizontalEdgeCount(rows, cols);
  const boxes: number[] = [];
  if (edge < h) {
    const r = Math.floor(edge / cols);
    const c = edge % cols;
    if (r > 0) boxes.push(boxId(cols, r - 1, c));
    if (r < rows) boxes.push(boxId(cols, r, c));
  } else {
    const v = edge - h;
    const r = Math.floor(v / (cols + 1));
    const c = v % (cols + 1);
    if (c > 0) boxes.push(boxId(cols, r, c - 1));
    if (c < cols) boxes.push(boxId(cols, r, c));
  }
  return boxes;
}

export interface DotPos {
  r: number;
  c: number;
}

/** Hai chấm đầu mút của cạnh — dùng cho renderer. */
export function edgeEndpoints(rows: number, cols: number, edge: number): [DotPos, DotPos] {
  const h = horizontalEdgeCount(rows, cols);
  if (edge < h) {
    const r = Math.floor(edge / cols);
    const c = edge % cols;
    return [
      { r, c },
      { r, c: c + 1 },
    ];
  }
  const v = edge - h;
  const r = Math.floor(v / (cols + 1));
  const c = v % (cols + 1);
  return [
    { r, c },
    { r: r + 1, c },
  ];
}

// ---------- Trạng thái ----------

/**
 * Ván mới trên lưới R×C. `mask` (R×C, tùy chọn): ô nào thuộc bàn — map hình thù. Ô ngoài mặt nạ
 * và cạnh không kề ô nào thuộc bàn mang giá trị VOID. Không có mask = bàn chữ nhật đầy đủ.
 */
export function createGame(rows: number, cols: number, mask?: readonly boolean[]): GameState {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new RangeError(`Kích thước bàn không hợp lệ: ${rows}x${cols}`);
  }
  if (mask && (mask.length !== rows * cols || !mask.some(Boolean))) {
    throw new RangeError(`Mặt nạ không hợp lệ cho bàn ${rows}x${cols}`);
  }
  const owners: Slot[] = new Array<Slot>(rows * cols).fill(-1);
  const edges: Slot[] = new Array<Slot>(edgeCount(rows, cols)).fill(-1);
  if (mask) {
    for (let b = 0; b < owners.length; b++) if (!mask[b]) owners[b] = VOID;
    for (let e = 0; e < edges.length; e++) {
      if (!edgeBoxes(rows, cols, e).some((b) => mask[b])) edges[e] = VOID;
    }
  }
  return { rows, cols, edges, owners, scores: [0, 0], turn: 0, moveNo: 0, finished: false };
}

/** Số cạnh vẽ được của bàn (không tính VOID) = số nước của cả ván. */
export function playableEdgeCount(state: GameState): number {
  let n = 0;
  for (const e of state.edges) if (e !== VOID) n++;
  return n;
}

/** Số ô thuộc bàn (không tính VOID). */
export function playableBoxCount(state: GameState): number {
  let n = 0;
  for (const o of state.owners) if (o !== VOID) n++;
  return n;
}

/** Các ô THUỘC BÀN kề một cạnh (bỏ ô VOID — ví dụ "lỗ" trong map hình thù). */
export function liveBoxes(state: GameState, edge: number): number[] {
  return edgeBoxes(state.rows, state.cols, edge).filter((b) => state.owners[b] !== VOID);
}

/** Số cạnh đã vẽ của ô (VOID không tính là đã vẽ). */
export function boxSideCount(state: GameState, box: number): number {
  const e = boxEdges(state.rows, state.cols, box);
  let n = 0;
  if (state.edges[e.top] >= 0) n++;
  if (state.edges[e.bottom] >= 0) n++;
  if (state.edges[e.left] >= 0) n++;
  if (state.edges[e.right] >= 0) n++;
  return n;
}

export function legalMoves(state: GameState): number[] {
  if (state.finished) return [];
  const moves: number[] = [];
  for (let i = 0; i < state.edges.length; i++) if (state.edges[i] === -1) moves.push(i);
  return moves;
}

export function validateMove(state: GameState, player: Player, edge: number): MoveErrorCode | null {
  if (state.finished) return "GAME_OVER";
  if (player !== state.turn) return "NOT_YOUR_TURN";
  if (!Number.isInteger(edge) || edge < 0 || edge >= state.edges.length) return "INVALID_EDGE";
  if (state.edges[edge] === VOID) return "INVALID_EDGE";
  if (state.edges[edge] !== -1) return "EDGE_TAKEN";
  return null;
}

/**
 * Áp dụng một nước đi. Thuần: trả về trạng thái mới, không sửa `state`.
 * Ăn ≥ 1 ô → giữ lượt; không → đổi lượt. Hết cạnh vẽ được → finished.
 */
export function applyMove(state: GameState, player: Player, edge: number): ApplyMoveResult {
  const error = validateMove(state, player, edge);
  if (error) return { ok: false, error };

  const edges: Slot[] = state.edges.slice();
  edges[edge] = player;
  const owners: Slot[] = state.owners.slice();
  const scores: [number, number] = [state.scores[0], state.scores[1]];
  const next: GameState = { ...state, edges, owners, scores, moveNo: state.moveNo + 1 };

  const captured: number[] = [];
  for (const box of liveBoxes(state, edge)) {
    if (owners[box] === -1 && boxSideCount(next, box) === 4) {
      owners[box] = player;
      scores[player]++;
      captured.push(box);
    }
  }

  const finished = next.moveNo === playableEdgeCount(next);
  const turn: Player = captured.length > 0 ? player : player === 0 ? 1 : 0;

  return { ok: true, state: { ...next, turn, finished }, captured };
}

/** Người thắng khi ván đã kết thúc; null = hòa. Ném lỗi nếu ván chưa xong. */
export function winner(state: GameState): Player | null {
  if (!state.finished) throw new Error("Ván chưa kết thúc");
  if (state.scores[0] === state.scores[1]) return null;
  return state.scores[0] > state.scores[1] ? 0 : 1;
}
