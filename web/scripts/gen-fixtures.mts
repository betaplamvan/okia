// Sinh fixture "ván ngẫu nhiên đầy đủ" từ engine TS để làm chuẩn so khớp với bản Python.
// Dùng RNG có seed nên chạy lại cho ra đúng cùng file.
//
//   node scripts/gen-fixtures.mts 3 3 1
//   node scripts/gen-fixtures.mts 5 5 7
//   node scripts/gen-fixtures.mts map khung-long 3     (map trong shared/maps/maps.json)
//
// Ghi vào shared/fixtures/<rows>x<cols | map-id>-van-ngau-nhien-seed<seed>.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyMove, createGame, legalMoves, winner } from "../src/game/rules.ts";

const args = process.argv.slice(2);
let rows: number;
let cols: number;
let seed: number;
let cells: string[] | undefined;
let label: string;
if (args[0] === "map") {
  const maps = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../shared/maps/maps.json", import.meta.url)), "utf8"),
  ).maps as { id: string; cells: string[] }[];
  const map = maps.find((m) => m.id === args[1]);
  if (!map) throw new Error(`không có map ${args[1]}`);
  cells = map.cells;
  rows = cells.length;
  cols = cells[0].length;
  seed = Number(args[2] ?? 1);
  label = map.id;
} else {
  rows = Number(args[0] ?? 3);
  cols = Number(args[1] ?? 3);
  seed = Number(args[2] ?? 1);
  label = `${rows}x${cols}`;
}
const mask = cells?.flatMap((row) => [...row].map((ch) => ch === "#"));

function mulberry32(s: number) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(seed);
let state = createGame(rows, cols, mask);
const moves: { player: number; edge: number; expectCaptured: number[] }[] = [];

while (!state.finished) {
  const legal = legalMoves(state);
  const edge = legal[Math.floor(rand() * legal.length)];
  const result = applyMove(state, state.turn, edge);
  if (!result.ok) throw new Error(result.error);
  moves.push({ player: state.turn, edge, expectCaptured: result.captured });
  state = result.state;
}

const fixture = {
  name: `${label}: ván ngẫu nhiên đầy đủ (seed ${seed}), sinh bởi scripts/gen-fixtures.mts`,
  rows,
  cols,
  ...(cells ? { cells } : {}),
  moves,
  expect: {
    scores: [...state.scores],
    turn: state.turn,
    finished: true,
    moveNo: state.moveNo,
    owners: [...state.owners],
    winner: winner(state),
  },
};

const out = fileURLToPath(
  new URL(`../../shared/fixtures/${label}-van-ngau-nhien-seed${seed}.json`, import.meta.url),
);
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log(`đã ghi ${out}: ${moves.length} nước, tỉ số ${state.scores.join("-")}`);
