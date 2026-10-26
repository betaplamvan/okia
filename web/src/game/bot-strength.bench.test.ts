// Đo độ mạnh (docs/03 — Thuật toán): bot ở các mức strength đấu bot tham lam (chỉ luật 1–3) trên
// 5×5, đổi bên mỗi ván. Không chạy trong `vitest run` thường (chậm) — bật bằng BENCH=1:
//   BENCH=1 pnpm exec vitest run src/game/bot-strength.bench.test.ts
import { describe, it } from "vitest";
import { chooseMove, chooseMoveGreedy } from "./bot";
import { createGameForMap } from "./maps";
import { applyMove, type Player } from "./rules";

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

describe.runIf(process.env.BENCH === "1")("bot strength vs tham lam", () => {
  it("bảng thắng / 20 ván", { timeout: 600_000 }, () => {
    const rows: string[] = [];
    for (const strength of [1, 0.8, 0.6, 0.4, 0.35, 0.2, 0.1]) {
      let wins = 0;
      for (let g = 0; g < 20; g++) {
        const random = mulberry32(1000 + g * 7 + strength * 100);
        let state = createGameForMap("5x5");
        const botSeat: Player = (g % 2) as Player;
        while (!state.finished) {
          const edge =
            state.turn === botSeat
              ? chooseMove(state, { strength, random })
              : chooseMoveGreedy(state, random);
          const res = applyMove(state, state.turn, edge);
          if (!res.ok) throw new Error("nước sai");
          state = res.state;
        }
        if (state.scores[botSeat] > state.scores[1 - botSeat]) wins += 1;
      }
      rows.push(`${strength}: thắng ${wins}/20`);
    }
    console.log(rows.join("\n"));
  });
});
