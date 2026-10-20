import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyMove,
  boxEdges,
  createGame,
  edgeBoxes,
  edgeCount,
  edgeEndpoints,
  legalMoves,
  winner,
  type GameState,
  type MoveErrorCode,
  type Player,
} from "./rules";

// ---------- Fixtures dùng chung với backend (docs/03) ----------

interface FixtureMove {
  player: Player;
  edge: number;
  expectCaptured?: number[];
  expectError?: MoveErrorCode;
}

interface Fixture {
  name: string;
  rows: number;
  cols: number;
  /** Mặt nạ ô (map hình thù): '#' thuộc bàn, '.' trống. */
  cells?: string[];
  moves: FixtureMove[];
  expect: {
    scores: [number, number];
    turn: Player;
    finished: boolean;
    moveNo?: number;
    owners?: number[];
    winner?: Player | null;
  };
}

const fixturesDir = join(__dirname, "../../../shared/fixtures");
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

describe("fixtures dùng chung", () => {
  it("có ít nhất một fixture", () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  for (const file of fixtureFiles) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as Fixture;

    it(`${file}: ${fixture.name}`, () => {
      const mask = fixture.cells?.flatMap((row) => [...row].map((ch) => ch === "#"));
      let state = createGame(fixture.rows, fixture.cols, mask);

      fixture.moves.forEach((move, i) => {
        const result = applyMove(state, move.player, move.edge);
        const label = `nước #${i + 1} (p${move.player} cạnh ${move.edge})`;

        if (move.expectError) {
          expect(result.ok, `${label}: phải lỗi ${move.expectError}`).toBe(false);
          if (!result.ok) expect(result.error, label).toBe(move.expectError);
          return; // trạng thái không đổi
        }

        expect(result.ok, `${label}: phải hợp lệ`).toBe(true);
        if (!result.ok) return;
        if (move.expectCaptured) {
          expect(result.captured, `${label}: ô ăn được`).toEqual(move.expectCaptured);
        }
        state = result.state;
      });

      expect([...state.scores]).toEqual(fixture.expect.scores);
      expect(state.turn).toBe(fixture.expect.turn);
      expect(state.finished).toBe(fixture.expect.finished);
      if (fixture.expect.moveNo !== undefined) expect(state.moveNo).toBe(fixture.expect.moveNo);
      if (fixture.expect.owners) expect([...state.owners]).toEqual(fixture.expect.owners);
      if (fixture.expect.winner !== undefined) expect(winner(state)).toBe(fixture.expect.winner);
    });
  }
});

// ---------- Tính chất tổng quát ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playRandomGame(rows: number, cols: number, seed: number): GameState {
  const rand = mulberry32(seed);
  let state = createGame(rows, cols);
  while (!state.finished) {
    const moves = legalMoves(state);
    const edge = moves[Math.floor(rand() * moves.length)];
    const before = state;
    const result = applyMove(state, state.turn, edge);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    // Ăn ô → giữ lượt; không → đổi lượt.
    const expectedTurn = result.captured.length > 0 ? before.turn : 1 - before.turn;
    expect(result.state.turn).toBe(expectedTurn);
    // Thuần: trạng thái cũ không bị sửa.
    expect(before.moveNo).toBe(state.moveNo);
    state = result.state;
  }
  return state;
}

describe("đánh số cạnh / ô", () => {
  it.each([
    [1, 1, 4],
    [2, 2, 12],
    [3, 3, 24],
    [5, 5, 60],
    [7, 7, 112],
    [2, 3, 17],
  ])("bàn %ix%i có %i cạnh", (rows, cols, expected) => {
    expect(edgeCount(rows, cols)).toBe(expected);
  });

  it("mỗi cạnh của ô đều liệt kê ngược lại ô đó, và mỗi cạnh thuộc 1–2 ô", () => {
    for (const [rows, cols] of [
      [1, 1],
      [2, 3],
      [5, 5],
    ]) {
      for (let box = 0; box < rows * cols; box++) {
        const e = boxEdges(rows, cols, box);
        for (const edge of [e.top, e.bottom, e.left, e.right]) {
          expect(edgeBoxes(rows, cols, edge)).toContain(box);
        }
      }
      for (let edge = 0; edge < edgeCount(rows, cols); edge++) {
        const boxes = edgeBoxes(rows, cols, edge);
        expect(boxes.length).toBeGreaterThanOrEqual(1);
        expect(boxes.length).toBeLessThanOrEqual(2);
        expect([...boxes].sort((a, b) => a - b)).toEqual(boxes);
        const [a, b] = edgeEndpoints(rows, cols, edge);
        expect(Math.abs(a.r - b.r) + Math.abs(a.c - b.c)).toBe(1);
      }
    }
  });

  it("ví dụ bàn 2x2 trong docs/03", () => {
    expect(boxEdges(2, 2, 0)).toEqual({ top: 0, bottom: 2, left: 6, right: 7 });
    expect(boxEdges(2, 2, 3)).toEqual({ top: 3, bottom: 5, left: 10, right: 11 });
    expect(edgeBoxes(2, 2, 2)).toEqual([0, 2]);
    expect(edgeBoxes(2, 2, 7)).toEqual([0, 1]);
    expect(edgeBoxes(2, 2, 11)).toEqual([3]);
  });
});

describe("ván ngẫu nhiên", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ])("bàn %ix%i luôn kết thúc với mọi ô có chủ và tổng điểm đúng", (rows, cols) => {
    for (let seed = 1; seed <= 5; seed++) {
      const state = playRandomGame(rows, cols, seed);
      expect(state.moveNo).toBe(edgeCount(rows, cols));
      expect(state.scores[0] + state.scores[1]).toBe(rows * cols);
      expect(state.owners.every((o) => o !== -1)).toBe(true);
      expect(legalMoves(state)).toEqual([]);
      const w = winner(state);
      if ((rows * cols) % 2 === 1) expect(w).not.toBeNull();
    }
  });

  it("createGame từ chối kích thước sai", () => {
    expect(() => createGame(0, 2)).toThrow(RangeError);
    expect(() => createGame(2, 1.5)).toThrow(RangeError);
  });
});
