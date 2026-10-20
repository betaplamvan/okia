/**
 * Bot thuật toán — đặc tả: docs/03-luat-choi.md#bot.
 * Một bot duy nhất; `strength ∈ [0, 1]` là xác suất bot chơi đúng ở mỗi quyết định
 * (phần còn lại là "lỗi có chủ đích" để người mới không bị đè bẹp).
 *
 * P0-17: ăn ô, cạnh an toàn, nhường chuỗi ngắn nhất.
 * P0-18 (sau): luật chuỗi dài, double-cross, tìm kiếm cuối ván.
 */
import {
  applyMove,
  boxSideCount,
  edgeBoxes,
  legalMoves,
  type GameState,
  type Player,
} from "./rules";

export interface BotOptions {
  /** Xác suất chơi đúng ở mỗi quyết định. Mặc định 0.7. */
  strength?: number;
  /** Nguồn ngẫu nhiên [0, 1) — truyền vào để test tái lập được. */
  random?: () => number;
}

export interface MoveClasses {
  /** Vẽ xong là ăn ≥ 1 ô. */
  capturing: number[];
  /** Không ô kề nào lên 3 cạnh sau khi vẽ. */
  safe: number[];
  /** Không ăn được gì mà lại tạo ô 3 cạnh (tặng ô cho đối thủ). */
  risky: number[];
}

export function classifyMoves(state: GameState): MoveClasses {
  const classes: MoveClasses = { capturing: [], safe: [], risky: [] };
  for (const edge of legalMoves(state)) {
    let maxSides = 0;
    for (const box of edgeBoxes(state.rows, state.cols, edge)) {
      maxSides = Math.max(maxSides, boxSideCount(state, box));
    }
    if (maxSides === 3) classes.capturing.push(edge);
    else if (maxSides <= 1) classes.safe.push(edge);
    else classes.risky.push(edge);
  }
  return classes;
}

/** Số ô một cạnh ăn được ngay (0, 1 hoặc 2). */
export function captureCount(state: GameState, edge: number): number {
  let n = 0;
  for (const box of edgeBoxes(state.rows, state.cols, edge)) {
    if (boxSideCount(state, box) === 3) n++;
  }
  return n;
}

/**
 * "Món quà": số ô đối thủ ăn được (tham lam, ăn hết chuỗi) nếu ta vẽ `edge` mà không ăn ô.
 * Dùng để chọn chuỗi ngắn nhất khi hết cạnh an toàn.
 */
export function giftSize(state: GameState, edge: number): number {
  const first = applyMove(state, state.turn, edge);
  if (!first.ok) return Number.POSITIVE_INFINITY;
  let cur = first.state;
  let gift = 0;
  if (first.captured.length > 0) return 0; // ta vẫn giữ lượt, không tặng gì
  while (!cur.finished) {
    const { capturing } = classifyMoves(cur);
    if (capturing.length === 0) break;
    // Đối thủ ăn cạnh nhiều ô nhất trước.
    const best = capturing.reduce((a, b) => (captureCount(cur, b) > captureCount(cur, a) ? b : a));
    const res = applyMove(cur, cur.turn, best);
    if (!res.ok) break;
    gift += res.captured.length;
    cur = res.state;
  }
  return gift;
}

function pick<T>(arr: readonly T[], random: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(random() * arr.length))];
}

/** Chọn nước đi cho người chơi đang có lượt (`state.turn`). Ném lỗi nếu ván đã kết thúc. */
export function chooseMove(state: GameState, opts: BotOptions = {}): number {
  const legal = legalMoves(state);
  if (legal.length === 0) throw new Error("Ván đã kết thúc, không còn nước đi");
  const strength = Math.min(1, Math.max(0, opts.strength ?? 0.7));
  const random = opts.random ?? Math.random;
  const mistake = () => random() > strength;

  const { capturing, safe, risky } = classifyMoves(state);

  if (capturing.length > 0 && !mistake()) {
    const best = Math.max(...capturing.map((e) => captureCount(state, e)));
    return pick(
      capturing.filter((e) => captureCount(state, e) === best),
      random,
    );
  }

  if (safe.length > 0) {
    return mistake() ? pick(legal, random) : pick(safe, random);
  }

  if (risky.length > 0) {
    if (mistake()) return pick(risky, random);
    const gifts = risky.map((e) => giftSize(state, e));
    const min = Math.min(...gifts);
    return pick(
      risky.filter((_, i) => gifts[i] === min),
      random,
    );
  }

  // Chỉ còn nước ăn ô nhưng bot "lỡ" bỏ qua ở trên → vẫn phải đi.
  return pick(legal, random);
}

export type { Player };
