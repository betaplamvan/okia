/**
 * Bot thuật toán — đặc tả: docs/03-luat-choi.md#bot.
 * Một bot duy nhất; `strength ∈ [0, 1]` là xác suất bot chơi đúng ở mỗi quyết định
 * (phần còn lại là "lỗi có chủ đích" để người mới không bị đè bẹp).
 *
 * P0-17: ăn ô, cạnh an toàn, nhường chuỗi ngắn nhất.
 * P0-18 (2026-10-22): tìm kiếm alpha-beta có bảng ghi nhớ cho tàn cuộc và pha cuối an toàn;
 * nhường đôi (double-dealing: bỏ lại 2 ô cuối chuỗi / 4 ô cuối vòng) để giữ quyền kiểm soát;
 * chọn chuỗi để nhường theo kết quả tìm kiếm thay vì chỉ "ngắn nhất".
 */
import {
  applyMove,
  boxEdges,
  boxSideCount,
  liveBoxes,
  legalMoves,
  type GameState,
  type Player,
} from "./rules";

export interface BotOptions {
  /** Xác suất chơi đúng ở mỗi quyết định. Mặc định 0.8. */
  strength?: number;
  /** Nguồn ngẫu nhiên [0, 1) — truyền vào để test tái lập được. */
  random?: () => number;
  /** Ngân sách tìm kiếm: số nút (mặc định 20 000). 0 = tắt tìm kiếm. */
  searchBudget?: number;
  /** Ngân sách thời gian cho một nước (ms, mặc định 150). */
  searchTimeMs?: number;
}

export interface MoveClasses {
  /** Vẽ xong là ăn ≥ 1 ô. */
  capturing: number[];
  /** Không ô kề nào lên 3 cạnh sau khi vẽ. */
  safe: number[];
  /** Không ăn được gì mà lại tạo ô 3 cạnh (tặng ô cho đối thủ). */
  risky: number[];
}

// ---------- Đếm cạnh ô (mảng, dùng lại trong tìm kiếm) ----------

/** Số cạnh đã vẽ của từng ô; ô VOID hoặc đã có chủ = -1 (không còn ăn được). */
function sidesOf(state: GameState): Int8Array {
  const sides = new Int8Array(state.owners.length);
  for (let b = 0; b < sides.length; b++) {
    sides[b] = state.owners[b] === -1 ? boxSideCount(state, b) : -1;
  }
  return sides;
}

function classifyWith(state: GameState, sides: Int8Array): MoveClasses {
  const classes: MoveClasses = { capturing: [], safe: [], risky: [] };
  for (let edge = 0; edge < state.edges.length; edge++) {
    if (state.edges[edge] !== -1) continue;
    let maxSides = -1;
    for (const box of liveBoxes(state, edge)) {
      if (sides[box] > maxSides) maxSides = sides[box];
    }
    if (maxSides === 3) classes.capturing.push(edge);
    else if (maxSides <= 1) classes.safe.push(edge);
    else classes.risky.push(edge);
  }
  return classes;
}

export function classifyMoves(state: GameState): MoveClasses {
  if (state.finished) return { capturing: [], safe: [], risky: [] };
  return classifyWith(state, sidesOf(state));
}

/** Số ô một cạnh ăn được ngay (0, 1 hoặc 2). */
export function captureCount(state: GameState, edge: number): number {
  let n = 0;
  for (const box of liveBoxes(state, edge)) {
    if (state.owners[box] === -1 && boxSideCount(state, box) === 3) n++;
  }
  return n;
}

/**
 * Mô phỏng ăn tham lam không cấp phát GameState: từ `sides` (bản sao), vẽ `startEdges` rồi ăn mọi
 * ô lên 4 cạnh, mỗi ô ăn xong vẽ tiếp cạnh còn thiếu của ô kề… Trả về các ô ăn được (theo thứ tự).
 * Nếu `startEdges` rỗng: ăn những ô đang 3 cạnh (= món đối thủ vừa mở).
 */
function captureWalk(
  state: GameState,
  sides0: Int8Array,
  drawn: Set<number>,
  startEdges: readonly number[],
): number[] {
  const sides = Int8Array.from(sides0);
  const { rows, cols } = state;
  const taken: number[] = [];
  const ripe: number[] = [];
  const draw = (edge: number) => {
    drawn.add(edge);
    for (const box of liveBoxes(state, edge)) {
      if (sides[box] < 0) continue;
      sides[box]++;
      if (sides[box] === 4) {
        sides[box] = -1;
        taken.push(box);
        // Ô ăn xong không mở thêm gì: cạnh vừa vẽ là cạnh cuối của nó.
      } else if (sides[box] === 3) ripe.push(box);
    }
  };
  for (const e of startEdges) draw(e);
  if (startEdges.length === 0) {
    for (let b = 0; b < sides.length; b++) if (sides[b] === 3) ripe.push(b);
  }
  while (ripe.length > 0) {
    const box = ripe.pop()!;
    if (sides[box] !== 3) continue;
    const e = boxEdges(rows, cols, box);
    const missing = [e.top, e.bottom, e.left, e.right].find(
      (x) => state.edges[x] === -1 && !drawn.has(x),
    );
    if (missing === undefined) continue;
    draw(missing);
  }
  return taken;
}

/** Các ô đối thủ ăn được (tham lam) nếu ta vẽ `edge` mà không ăn ô; [] nếu ta vẫn giữ lượt. */
export function giftBoxes(state: GameState, edge: number): number[] {
  if (state.edges[edge] !== -1) return [];
  const sides = sidesOf(state);
  for (const box of liveBoxes(state, edge)) if (sides[box] === 3) return [];
  return captureWalk(state, sides, new Set(), [edge]);
}

/**
 * "Món quà": số ô đối thủ ăn được (tham lam, ăn hết chuỗi) nếu ta vẽ `edge` mà không ăn ô.
 * Dùng để chọn chuỗi ngắn nhất khi hết cạnh an toàn (và không tìm kiếm được).
 */
export function giftSize(state: GameState, edge: number): number {
  if (state.edges[edge] !== -1) return Number.POSITIVE_INFINITY;
  return giftBoxes(state, edge).length;
}

function pick<T>(arr: readonly T[], random: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(random() * arr.length))];
}

// ---------- Tìm kiếm ----------

const DEFAULT_BUDGET = 20_000;
const DEFAULT_TIME_MS = 150;
/** Chỉ tìm kiếm qua pha an toàn khi còn ít cạnh an toàn (mỗi cạnh an toàn tốn 1 độ sâu). */
const SAFE_SEARCH_MAX = 10;
const SAFE_DEPTH = 3;

class BudgetExceeded extends Error {}

interface Ctx {
  nodes: number;
  budget: number;
  deadline: number;
  /** key → [giá trị, loại: 0 chính xác, 1 cận dưới, 2 cận trên] */
  tt: Map<string, [number, 0 | 1 | 2]>;
}

function keyOf(state: GameState): string {
  // Chỉ cần cạnh đã vẽ hay chưa (điểm không ảnh hưởng nước tối ưu từ đây) + lượt.
  const parts: number[] = [];
  let acc = 0;
  let bit = 0;
  for (let i = 0; i < state.edges.length; i++) {
    if (state.edges[i] !== -1) acc |= 1 << bit;
    if (++bit === 30) {
      parts.push(acc);
      acc = 0;
      bit = 0;
    }
  }
  parts.push(acc, state.turn);
  return parts.join(",");
}

/**
 * Nước đi đáng xét ở một thế (cắt tỉa theo lý thuyết Dots & Boxes):
 * - Có ô ăn được: ăn (một cạnh ăn nhiều ô nhất là đủ — thứ tự ăn không đổi giá trị), và nếu đã hết
 *   cạnh an toàn thì thêm các nước **nhường đôi**: vẽ cạnh không ăn mà món quà cho đối thủ chỉ gồm
 *   những ô ta đang ăn được (bỏ lại 2 ô cuối chuỗi / 4 ô cuối vòng để đối thủ phải mở chuỗi tiếp).
 * - Không ăn được, còn cạnh an toàn: mọi cạnh an toàn.
 * - Chỉ còn cạnh nhường: gom các cạnh mở cùng một chuỗi/vòng (cùng tập ô tặng), giữ 2 đại diện
 *   (đầu và giữa chuỗi có thể khác nhau).
 */
function candidates(state: GameState, sides: Int8Array, classes: MoveClasses): number[] {
  const { capturing, safe, risky } = classes;
  if (capturing.length > 0) {
    let best = capturing[0];
    let bestN = 0;
    for (const e of capturing) {
      const n = captureCount(state, e);
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    }
    const out = [best];
    if (safe.length === 0 && risky.length > 0) {
      const ripe = new Set(captureWalk(state, sides, new Set(), []));
      for (const e of risky) {
        const gift = captureWalk(state, sides, new Set(), [e]);
        if (gift.length > 0 && gift.every((b) => ripe.has(b))) out.push(e);
      }
    }
    return out;
  }
  if (safe.length > 0) return safe;
  const groups = new Map<string, number[]>();
  for (const e of risky) {
    const k = captureWalk(state, sides, new Set(), [e])
      .sort((a, b) => a - b)
      .join(",");
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }
  const out: number[] = [];
  for (const g of groups.values()) {
    out.push(g[0]);
    if (g.length > 2) out.push(g[Math.floor(g.length / 2)]);
  }
  return out;
}

/**
 * Negamax + alpha-beta + bảng ghi nhớ. Giá trị = (ô người đang có lượt sẽ ăn thêm) − (ô đối thủ
 * sẽ ăn thêm) từ thế này tới hết ván, hai bên chơi tối ưu trong tập nước đáng xét.
 * `depth`: số cạnh an toàn còn được xét (hết thì coi phần còn lại hòa — chỉ dùng ở pha an toàn).
 */
function search(state: GameState, alpha: number, beta: number, depth: number, ctx: Ctx): number {
  if (state.finished) return 0;
  if (++ctx.nodes > ctx.budget) throw new BudgetExceeded();
  if ((ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) throw new BudgetExceeded();
  const key = keyOf(state) + ":" + depth;
  const hit = ctx.tt.get(key);
  if (hit) {
    const [v, kind] = hit;
    if (kind === 0) return v;
    if (kind === 1 && v >= beta) return v;
    if (kind === 2 && v <= alpha) return v;
  }
  const sides = sidesOf(state);
  const classes = classifyWith(state, sides);
  const isSafePhase = classes.capturing.length === 0 && classes.safe.length > 0;
  if (isSafePhase && depth === 0) return 0;

  const alpha0 = alpha;
  let best = Number.NEGATIVE_INFINITY;
  for (const edge of candidates(state, sides, classes)) {
    const r = applyMove(state, state.turn, edge);
    if (!r.ok) continue;
    const gain = r.captured.length;
    const d = isSafePhase ? depth - 1 : depth;
    let v: number;
    if (r.state.turn === state.turn) {
      v = gain + search(r.state, alpha - gain, beta - gain, d, ctx);
    } else {
      v = gain - search(r.state, gain - beta, gain - alpha, d, ctx);
    }
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  if (best === Number.NEGATIVE_INFINITY) return 0;
  ctx.tt.set(key, [best, best <= alpha0 ? 2 : best >= beta ? 1 : 0]);
  return best;
}

/**
 * Nước tốt nhất theo tìm kiếm trong ngân sách; null nếu quá ngân sách (gọi nơi dùng tự quay về
 * heuristic). `moves`: tập nước gốc để chấm điểm (đã cắt tỉa). `ties`: mọi nước cùng giá trị tốt nhất.
 */
export function searchBest(
  state: GameState,
  moves: readonly number[],
  budget = DEFAULT_BUDGET,
  depth = SAFE_DEPTH,
  timeMs = DEFAULT_TIME_MS,
): { edge: number; value: number; ties: number[] } | null {
  if (budget <= 0 || moves.length === 0) return null;
  const ctx: Ctx = { nodes: 0, budget, deadline: Date.now() + timeMs, tt: new Map() };
  const scored: [number, number][] = [];
  try {
    for (const edge of moves) {
      const r = applyMove(state, state.turn, edge);
      if (!r.ok) continue;
      const gain = r.captured.length;
      const v =
        r.state.turn === state.turn
          ? gain + search(r.state, -Infinity, Infinity, depth, ctx)
          : gain - search(r.state, -Infinity, Infinity, depth, ctx);
      scored.push([edge, v]);
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) return null;
    throw e;
  }
  if (scored.length === 0) return null;
  const value = Math.max(...scored.map(([, v]) => v));
  const ties = scored.filter(([, v]) => v === value).map(([e]) => e);
  return { edge: ties[0], value, ties };
}

/**
 * Giữa các nước cùng giá trị: ưu tiên ăn ngay (chắc ô), rồi món quà nhỏ nhất (giữ nhiều lựa chọn),
 * còn lại ngẫu nhiên.
 */
function breakTies(state: GameState, ties: readonly number[], random: () => number): number {
  const capt = ties.filter((e) => captureCount(state, e) > 0);
  if (capt.length > 0) return pick(capt, random);
  const gifts = ties.map((e) => giftSize(state, e));
  const min = Math.min(...gifts);
  return pick(
    ties.filter((_, i) => gifts[i] === min),
    random,
  );
}

// ---------- Chọn nước ----------

/**
 * Bot cũ (P0-17), không tìm kiếm — giữ để so sánh và làm nước "lỗi" ở các mức strength thấp:
 * ăn ô → cạnh an toàn → nhường chuỗi ngắn nhất.
 */
export function chooseMoveGreedy(state: GameState, random: () => number = Math.random): number {
  const legal = legalMoves(state);
  if (legal.length === 0) throw new Error("Ván đã kết thúc, không còn nước đi");
  const { capturing, safe, risky } = classifyMoves(state);
  if (capturing.length > 0) {
    const best = Math.max(...capturing.map((e) => captureCount(state, e)));
    return pick(
      capturing.filter((e) => captureCount(state, e) === best),
      random,
    );
  }
  if (safe.length > 0) return pick(safe, random);
  if (risky.length > 0) {
    const gifts = risky.map((e) => giftSize(state, e));
    const min = Math.min(...gifts);
    return pick(
      risky.filter((_, i) => gifts[i] === min),
      random,
    );
  }
  return pick(legal, random);
}

/**
 * Chọn nước đi cho người chơi đang có lượt (`state.turn`). Ném lỗi nếu ván đã kết thúc.
 *
 * Mô hình "lỗi có chủ đích" (docs/03): với xác suất `1 − strength` ở mỗi quyết định, bot bỏ lớp
 * tìm kiếm / nhường đôi và chơi như bot cũ (ăn tham lam, cạnh an toàn ngẫu nhiên, nhường chuỗi
 * ngắn nhất) — vẫn là nước "biết chơi". Nước ngớ ngẩn (quên ăn, vẽ cạnh thứ ba khi còn cạnh an
 * toàn) chỉ xuất hiện khi strength < 0.6, xác suất `(0.6 − strength) / 2` (sàn 0.4 → 10 %).
 * Đo 2026-10-22: mô hình cũ (lỗi = nước ngẫu nhiên) ở 0.8 thua bot tham lam 19/20 — lý do
 * "máy quá dễ".
 */
export function chooseMove(state: GameState, opts: BotOptions = {}): number {
  const legal = legalMoves(state);
  if (legal.length === 0) throw new Error("Ván đã kết thúc, không còn nước đi");
  const strength = Math.min(1, Math.max(0, opts.strength ?? 0.8));
  const random = opts.random ?? Math.random;
  const budget = opts.searchBudget ?? DEFAULT_BUDGET;
  const timeMs = opts.searchTimeMs ?? DEFAULT_TIME_MS;
  /** Bỏ lớp tìm kiếm ở quyết định này. */
  const lazy = () => random() > strength;
  /** Nước ngớ ngẩn — chỉ ở strength thấp. */
  const blunderP = Math.max(0, 0.6 - strength) / 2;
  const blunder = () => blunderP > 0 && random() < blunderP;

  const sides = sidesOf(state);
  const classes = classifyWith(state, sides);
  const { capturing, safe, risky } = classes;

  if (capturing.length > 0) {
    if (blunder()) return pick(legal, random); // "quên" ăn
    // Hết cạnh an toàn: cân nhắc nhường đôi (giữ quyền kiểm soát) bằng tìm kiếm.
    if (safe.length === 0 && !lazy()) {
      const found = searchBest(
        state,
        candidates(state, sides, classes),
        budget,
        SAFE_DEPTH,
        timeMs,
      );
      if (found) return breakTies(state, found.ties, random);
    }
    const best = Math.max(...capturing.map((e) => captureCount(state, e)));
    return pick(
      capturing.filter((e) => captureCount(state, e) === best),
      random,
    );
  }

  if (safe.length > 0) {
    if (blunder()) return pick(legal, random);
    // Pha cuối an toàn: cạnh an toàn nào mở ra tàn cuộc có lợi (luật chuỗi dài) — tìm kiếm.
    if (safe.length <= SAFE_SEARCH_MAX && !lazy()) {
      const found = searchBest(state, safe, budget, SAFE_DEPTH, timeMs);
      if (found) return pick(found.ties, random);
    }
    return pick(safe, random);
  }

  if (risky.length > 0) {
    if (blunder()) return pick(risky, random);
    if (!lazy()) {
      const found = searchBest(
        state,
        candidates(state, sides, classes),
        budget,
        SAFE_DEPTH,
        timeMs,
      );
      if (found) return breakTies(state, found.ties, random);
    }
    const gifts = risky.map((e) => giftSize(state, e));
    const min = Math.min(...gifts);
    return pick(
      risky.filter((_, i) => gifts[i] === min),
      random,
    );
  }

  return pick(legal, random);
}

export type { Player };
