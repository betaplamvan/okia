// Sinh dữ liệu bể map từ shared/maps/maps.json (nguồn chung) cho hai phía:
//   - web/src/game/maps.data.ts  (bundle client không import được file ngoài web/)
//   - api/app/game/maps.json     (image api build với context api/, không thấy shared/)
// Test hai bên (maps.test.ts, test_maps.py) báo đỏ nếu bản sinh lệch nguồn.
//
//   node scripts/gen-maps.mjs        (hoặc pnpm gen:maps)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = JSON.parse(readFileSync(at("../../shared/maps/maps.json"), "utf8"));
const maps = src.maps;

const ts =
  "// File sinh tự động bởi scripts/gen-maps.mjs từ shared/maps/maps.json — KHÔNG sửa tay.\n" +
  'import type { MapSource } from "./maps";\n\n' +
  `export const MAP_SOURCES: readonly MapSource[] = ${JSON.stringify(maps, null, 2)};\n`;
writeFileSync(at("../src/game/maps.data.ts"), ts);
writeFileSync(at("../../api/app/game/maps.json"), JSON.stringify({ maps }, null, 2) + "\n");
console.log(`đã sinh ${maps.length} map: ${maps.map((m) => m.id).join(", ")}`);
