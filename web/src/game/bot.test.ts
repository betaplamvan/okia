import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureCount,
  chooseMove,
  chooseMoveGreedy,
  classifyMoves,
  giftSize,
  searchBest,
} from "./bot";
import { applyMove, createGame, legalMoves, type GameState, type Player } from "./rules";
import { createGameForMap } from "./maps";

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
  it("luôn đi nước hợp lệ ở mọi strength, cả hai bên là bot", { timeout: 60_000 }, () => {
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

  it("hết cạnh an toàn, không tìm kiếm: nhường chuỗi ngắn nhất", () => {
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
      const edge = chooseMove(state, { strength: 1, random: mulberry32(g), searchBudget: 0 });
      expect(giftSize(state, edge)).toBe(min);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("strength 1 + tìm kiếm: nước nhường không bao giờ tệ hơn nước tối ưu (3×3 giải hết)", () => {
    const random = mulberry32(11);
    let checked = 0;
    for (let g = 0; g < 300 && checked < 12; g++) {
      let state = createGame(3, 3);
      while (!state.finished) {
        const { capturing, safe, risky } = classifyMoves(state);
        if (capturing.length === 0 && safe.length === 0 && risky.length > 1) break;
        const legal = legalMoves(state);
        const r = applyMove(state, state.turn, legal[Math.floor(random() * legal.length)]);
        if (r.ok) state = r.state;
      }
      if (state.finished) continue;
      const exact = searchBest(state, legalMoves(state), 5_000_000, 99)!;
      const edge = chooseMove(state, { strength: 1, random: mulberry32(g) });
      const chosen = searchBest(state, [edge], 5_000_000, 99)!;
      expect(chosen.value, `ván ${g}: cạnh ${edge}`).toBe(exact.value);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("nhường đôi: chuỗi 2 ô cuối trên 1×3 — bỏ lại 2 ô để giữ quyền kiểm soát khi có lợi", () => {
    // Bàn 1×3 (ô 0,1,2). Cạnh: ngang 0..5 (trên 0,1,2; dưới 3,4,5), dọc 6..9.
    // Vẽ mọi cạnh ngoài trừ: để lại hai cạnh dọc giữa (7, 8) chưa vẽ và cạnh 9 chưa vẽ:
    // chuỗi 3 ô mở ở đầu trái (ô 0 có 3 cạnh). Người có lượt ăn được ô 0 (cạnh 7).
    const state = play(createGame(1, 3), [
      [0, 0],
      [1, 1],
      [0, 2],
      [1, 3],
      [0, 4],
      [1, 5],
      [0, 6], // ô 0 lên 3 cạnh → lượt sang p1, p1 đang có lượt và ăn được
    ]);
    expect(state.turn).toBe(1);
    expect(classifyMoves(state).capturing).toContain(7);
    // Không còn gì khác trên bàn: ăn hết 3 ô là tối ưu (nhường đôi chỉ có lợi khi còn chuỗi khác).
    expect(chooseMove(state, { strength: 1, random: never })).toBe(7);
  });

  it("nhường đôi: còn chuỗi dài phía sau thì bỏ lại 2 ô, ép đối thủ mở chuỗi dài", () => {
    // 2×3: hàng trên là chuỗi 3 ô mở sẵn (ô 0 có 3 cạnh), hàng dưới là chuỗi 3 ô kín (mỗi ô 2 cạnh).
    // Cạnh ngang: r0: 0,1,2; r1: 3,4,5; r2: 6,7,8. Dọc: r0: 9,10,11,12; r1: 13,14,15,16.
    const state = play(createGame(2, 3), [
      [0, 0],
      [1, 1],
      [0, 2],
      [1, 3],
      [0, 4],
      [1, 5],
      [0, 6],
      [1, 7],
      [0, 8],
      [1, 9], // ô 0 lên 3 cạnh (0, 3, 9) → p0 có lượt, ăn được ô 0 qua cạnh 10
    ]);
    expect(state.turn).toBe(0);
    expect(classifyMoves(state).capturing).toContain(10);
    expect(classifyMoves(state).safe).toHaveLength(0);
    // Ăn tham lam: p0 lấy 3 ô trên (10, 11, 12) rồi phải mở chuỗi dưới → p1 lấy 3 → 3-3 hòa.
    // Nhường đôi: p0 ăn ô 0 (10), rồi vẽ cạnh 12 (bỏ lại ô 1, 2 thành cặp chung cạnh 11), p1 ăn
    // 2 ô rồi phải mở chuỗi dưới → p0 ăn 3 → p0 thắng 4-2. Bot phải thấy được qua tìm kiếm.
    let s = state;
    const first = chooseMove(s, { strength: 1, random: never });
    expect(first).toBe(10);
    s = play(s, [[0, 10]]);
    const second = chooseMove(s, { strength: 1, random: never });
    expect(second).toBe(12);
  });

  it("bot mới thắng áp đảo bot cũ (tham lam) trên 5×5", { timeout: 180_000 }, () => {
    let wins = 0;
    let draws = 0;
    const games = 12;
    for (let g = 0; g < games; g++) {
      const random = mulberry32(100 + g);
      const newSeat: Player = g % 2 === 0 ? 0 : 1;
      let state = createGame(5, 5);
      while (!state.finished) {
        const edge =
          state.turn === newSeat
            ? chooseMove(state, { strength: 1, random })
            : chooseMoveGreedy(state, random);
        const r = applyMove(state, state.turn, edge);
        if (!r.ok) throw new Error(r.error);
        state = r.state;
      }
      const diff = state.scores[newSeat] - state.scores[1 - newSeat];
      if (diff > 0) wins++;
      else if (diff === 0) draws++;
    }
    expect(wins + draws / 2, `thắng ${wins}, hòa ${draws} / ${games}`).toBeGreaterThanOrEqual(
      games * 0.75,
    );
  });

  it("tìm kiếm trong ngân sách: một nước trên 7×7 không quá 400 ms", { timeout: 60_000 }, () => {
    const random = mulberry32(5);
    let state = createGame(7, 7);
    // Chơi tới khi gần hết cạnh an toàn để tìm kiếm bị kích hoạt.
    while (!state.finished && classifyMoves(state).safe.length > 8) {
      const r = applyMove(state, state.turn, chooseMoveGreedy(state, random));
      if (r.ok) state = r.state;
    }
    const t0 = performance.now();
    while (!state.finished) {
      const t1 = performance.now();
      const edge = chooseMove(state, { strength: 1, random });
      expect(performance.now() - t1).toBeLessThan(400);
      const r = applyMove(state, state.turn, edge);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(performance.now() - t0).toBeLessThan(20_000);
  });

  it("map có lỗ: 3 cạnh quanh lỗ không bị coi là sắp ăn được", () => {
    // Vòng 3×3, lỗ ở giữa (ô 4). Vẽ 3 cạnh quanh lỗ: cạnh thứ 4 không ăn được gì.
    let state = createGame(3, 3, [true, true, true, true, false, true, true, true, true]);
    for (const edge of [4, 7, 17]) {
      const r = applyMove(state, state.turn, edge);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const { capturing } = classifyMoves(state);
    expect(capturing).not.toContain(18);
    expect(captureCount(state, 18)).toBe(0);
  });

  it("map hình thù: bot luôn đi hợp lệ tới hết ván", { timeout: 60_000 }, () => {
    let state = createGameForMap("khung-long");
    const random = mulberry32(3);
    while (!state.finished) {
      const edge = chooseMove(state, { strength: 0.8, random });
      const r = applyMove(state, state.turn, edge);
      if (!r.ok) throw new Error(`${edge}: ${r.error}`);
      state = r.state;
    }
    expect(state.finished).toBe(true);
  });

  it("strength 0: vẫn đi hợp lệ và không ném lỗi", () => {
    const state = createGame(2, 2);
    expect(legalMoves(state)).toContain(chooseMove(state, { strength: 0, random: () => 0.99 }));
  });
});
