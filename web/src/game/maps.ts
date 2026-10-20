/**
 * Bể map (docs/03 — Map). Nguồn: shared/maps/maps.json → maps.data.ts (scripts/gen-maps.mjs).
 * Map = lưới R×C + mặt nạ ô; bàn chữ nhật là mặt nạ đầy. Bản Python: api/app/game/maps.py.
 */
import { MAP_SOURCES } from "./maps.data";
import { createGame, type GameState } from "./rules";

export interface MapSource {
  id: string;
  name: { vi: string; en: string };
  kind: "rect" | "shape";
  /** Chỉ dùng cho test (không hiện ở giao diện, server production từ chối). */
  hidden?: boolean;
  /** Mỗi chuỗi một hàng ô: '#' thuộc bàn, '.' trống. */
  cells: readonly string[];
}

export interface GameMap extends MapSource {
  rows: number;
  cols: number;
  /** R×C: ô có thuộc bàn không. */
  mask: readonly boolean[];
  boxCount: number;
}

/** Giá trị đặc biệt: chọn ngẫu nhiên một map trong bể lúc tạo ván. */
export const RANDOM_MAP = "random";

function build(src: MapSource): GameMap {
  const rows = src.cells.length;
  const cols = src.cells[0]?.length ?? 0;
  const mask = src.cells.flatMap((row) => [...row].map((ch) => ch === "#"));
  return { ...src, rows, cols, mask, boxCount: mask.filter(Boolean).length };
}

export const MAPS: readonly GameMap[] = MAP_SOURCES.map(build);
/** Map người chơi chọn được / bốc ngẫu nhiên. */
export const POOL: readonly GameMap[] = MAPS.filter((m) => !m.hidden);
export const DEFAULT_MAP_ID = "5x5";

const byId = new Map(MAPS.map((m) => [m.id, m]));

export function getMap(id: string): GameMap | undefined {
  return byId.get(id);
}

export function randomMapId(random: () => number = Math.random): string {
  return POOL[Math.min(POOL.length - 1, Math.floor(random() * POOL.length))].id;
}

/** "random" → một map cụ thể; id lạ → map mặc định. */
export function resolveMapId(id: string, random: () => number = Math.random): string {
  if (id === RANDOM_MAP) return randomMapId(random);
  return byId.has(id) ? id : DEFAULT_MAP_ID;
}

export function createGameForMap(id: string): GameState {
  const map = getMap(id) ?? getMap(DEFAULT_MAP_ID)!;
  return map.kind === "rect"
    ? createGame(map.rows, map.cols)
    : createGame(map.rows, map.cols, map.mask);
}
