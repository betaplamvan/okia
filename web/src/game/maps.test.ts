import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createGameForMap,
  DEFAULT_MAP_ID,
  getMap,
  MAPS,
  POOL,
  RANDOM_MAP,
  randomMapId,
  resolveMapId,
} from "./maps";
import { MAP_SOURCES } from "./maps.data";
import { applyMove, legalMoves, playableBoxCount, playableEdgeCount, VOID, winner } from "./rules";

const shared = JSON.parse(
  readFileSync(join(__dirname, "../../../shared/maps/maps.json"), "utf8"),
) as { maps: unknown[] };

describe("bể map", () => {
  it("maps.data.ts khớp shared/maps/maps.json (chạy pnpm gen:maps sau khi sửa map)", () => {
    expect(MAP_SOURCES).toEqual(shared.maps);
  });

  it("bể chọn được: 5×5, 7×7 và các map hình thù; 3×3 chỉ còn là map ẩn cho test", () => {
    expect(POOL.map((m) => m.id)).toEqual(expect.arrayContaining(["5x5", "7x7"]));
    expect(POOL.filter((m) => m.kind === "shape").length).toBeGreaterThanOrEqual(5);
    expect(POOL.some((m) => m.id === "3x3")).toBe(false);
    expect(getMap("3x3")?.hidden).toBe(true);
    expect(getMap(DEFAULT_MAP_ID)).toBeDefined();
  });

  for (const map of MAPS) {
    it(`${map.id}: số ô lẻ, các ô liền nhau, khung bao khít, có tên vi/en`, () => {
      // Lẻ → không thể hòa khi chơi hết ván.
      expect(map.boxCount % 2).toBe(1);
      expect(map.cells.every((row) => row.length === map.cols && /^[#.]+$/.test(row))).toBe(true);
      // Khung bao khít: hàng/cột đầu và cuối đều có ô.
      expect(map.cells[0]).toContain("#");
      expect(map.cells[map.rows - 1]).toContain("#");
      expect(map.cells.some((row) => row[0] === "#")).toBe(true);
      expect(map.cells.some((row) => row[map.cols - 1] === "#")).toBe(true);
      // Liền nhau theo cạnh (chạm góc không tính).
      const at = (r: number, c: number) =>
        r >= 0 && r < map.rows && c >= 0 && c < map.cols && map.mask[r * map.cols + c];
      const start = map.mask.indexOf(true);
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) {
        const b = stack.pop()!;
        const r = Math.floor(b / map.cols);
        const c = b % map.cols;
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const n = (r + dr) * map.cols + (c + dc);
          if (at(r + dr, c + dc) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      expect(seen.size).toBe(map.boxCount);
      expect(map.name.vi && map.name.en).toBeTruthy();
    });
  }

  it("createGameForMap: ô/cạnh ngoài mặt nạ là VOID, bàn chữ nhật không có VOID", () => {
    const rect = createGameForMap("7x7");
    expect(rect.edges.includes(VOID)).toBe(false);
    expect(playableEdgeCount(rect)).toBe(112);
    const dino = createGameForMap("khung-long");
    expect(playableBoxCount(dino)).toBe(getMap("khung-long")!.boxCount);
    expect(playableEdgeCount(dino)).toBeLessThan(dino.edges.length);
  });

  it.each(POOL.map((m) => m.id))("%s: ván ngẫu nhiên luôn kết thúc, có người thắng", (id) => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let state = createGameForMap(id);
    while (!state.finished) {
      const moves = legalMoves(state);
      const res = applyMove(state, state.turn, moves[Math.floor(rand() * moves.length)]);
      if (!res.ok) throw new Error(res.error);
      state = res.state;
    }
    expect(state.moveNo).toBe(playableEdgeCount(state));
    expect(state.scores[0] + state.scores[1]).toBe(getMap(id)!.boxCount);
    expect(winner(state)).not.toBeNull();
  });

  it("random/resolve: chỉ bốc trong bể; id lạ về mặc định", () => {
    for (let i = 0; i < 50; i++) {
      const id = randomMapId();
      expect(POOL.some((m) => m.id === id)).toBe(true);
    }
    expect(resolveMapId(RANDOM_MAP, () => 0)).toBe(POOL[0].id);
    expect(resolveMapId("khung-long")).toBe("khung-long");
    expect(resolveMapId("khong-co")).toBe(DEFAULT_MAP_ID);
  });
});
