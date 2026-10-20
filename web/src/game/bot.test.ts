import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureCount, chooseMove, classifyMoves, giftSize } from "./bot";
import { applyMove, createGame, legalMoves, type GameState, type Player } from "./rules";

const never = () => 0; // random() = 0 → không bao giờ "lỗi", luôn chọn phần tử đầu

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

function play(state: GameState, moves: [Player, number][]): GameState {
  for (const [p, e] of moves) {
    const r = applyMove(state, p, e);
    if (!r.ok) throw new Error(`${r.error} tại p${p} cạnh ${e}`);
    state = r.state;
  }
  return state;
}

// ---------- Fixtures tình huống dùng chung với bot.py ----------

interface BotFixture {
  name: string;
  rows: number;
  cols: number;
  moves: { player: Player; edge: number }[];
  acceptable: number[];
}

const dir = join(__dirname, "../../../shared/fixtures/bot");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("fixtures tình huống của bot (strength = 1)", () => {
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(dir, file), "utf8")) as BotFixture;
    it(`${file}: ${fx.name}`, () => {
      const state = play(
        createGame(fx.rows, fx.cols),
        fx.moves.map((m) => [m.player, m.edge]),
      );
      // Thử nhiều nguồn ngẫu nhiên khác nhau: mọi lựa chọn đều phải nằm trong tập chấp nhận.
      for (let seed = 1; seed <= 20; seed++) {
        const edge = chooseMove(state, { strength: 1, random: mulberry32(seed) });
        expect(fx.acceptable, `seed ${seed} chọn cạnh ${edge}`).toContain(edge);
      }
    });
  }
});

// ---------- Tính chất ----------

describe("chooseMove", () => {
  it("luôn đi nước hợp lệ ở mọi strength, cả hai bên là bot", () => {
    for (const strength of [0, 0.3, 0.7, 1]) {
      for (let seed = 1; seed <= 3; seed++) {
        const random = mulberry32(seed * 10 + strength * 10);
        let state = createGame(4, 4);
        while (!state.finished) {
          const edge = chooseMove(state, { strength, random });
          expect(legalMoves(state)).toContain(edge);
          const r = applyMove(state, state.turn, edge);
          expect(r.ok).toBe(true);
          if (r.ok) state = r.state;
        }
        expect(state.scores[0] + state.scores[1]).toBe(16);
      }
    }
  });

  it("strength 1: ăn ô khi có thể, ưu tiên cạnh ăn 2 ô", () => {
    // 2x2: ô 0 và ô 2 cùng thiếu đúng cạnh 2; ô 1 thiếu cạnh 3 (sau khi có 1, 8, 7).
    const state = play(createGame(2, 2), [
      [0, 0],
      [1, 6],
      [0, 7],
      [1, 4],
      [0, 9],
      [1, 10],
    ]);
    expect(classifyMoves(state).capturing).toContain(2);
    expect(captureCount(state, 2)).toBe(2);
    expect(chooseMove(state, { strength: 1, random: never })).toBe(2);
  });

  it("strength 1: không vẽ cạnh thứ ba khi còn cạnh an toàn (trên vị trí ngẫu nhiên)", () => {
    const random = mulberry32(42);
    for (let g = 0; g < 30; g++) {
      let state = createGame(3, 3);
      const steps = Math.floor(random() * 8);
      for (let i = 0; i < steps && !state.finished; i++) {
        const legal = legalMoves(state);
        const r = applyMove(state, state.turn, legal[Math.floor(random() * legal.length)]);
        if (r.ok) state = r.state;
      }
      if (state.finished) continue;
      const { capturing, safe } = classifyMoves(state);
      if (safe.length === 0) continue;
      const edge = chooseMove(state, { strength: 1, random: mulberry32(g) });
      expect([...capturing, ...safe]).toContain(edge);
    }
  });

  it("strength 1: hết cạnh an toàn thì nhường chuỗi ngắn nhất", () => {
    const random = mulberry32(7);
    let checked = 0;
    for (let g = 0; g < 200 && checked < 10; g++) {
      let state = createGame(3, 3);
      while (!state.finished) {
        const { capturing, safe, risky } = classifyMoves(state);
        if (capturing.length === 0 && safe.length === 0 && risky.length > 1) break;
        const legal = legalMoves(state);
        const r = applyMove(state, state.turn, legal[Math.floor(random() * legal.length)]);
        if (r.ok) state = r.state;
      }
      if (state.finished) continue;
      const { risky } = classifyMoves(state);
      const gifts = risky.map((e) => giftSize(state, e));
      const min = Math.min(...gifts);
      if (gifts.every((x) => x === min)) continue; // không phân biệt được, bỏ qua
      const edge = chooseMove(state, { strength: 1, random: mulberry32(g) });
      expect(giftSize(state, edge)).toBe(min);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("strength 0: vẫn đi hợp lệ và không ném lỗi", () => {
    const state = createGame(2, 2);
    expect(legalMoves(state)).toContain(chooseMove(state, { strength: 0, random: () => 0.99 }));
  });
});
