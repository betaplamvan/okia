// Gom manifest skin shared/skins/{pen,box}/<id>.json (nguồn chuẩn, docs/08) thành catalog cho hai phía:
//   - web/src/game/skins/catalog.data.ts  (bundle client không import được file ngoài web/)
//   - api/app/skins/catalog.json          (image api build với context api/, không thấy shared/)
// Kiểm tra manifest: id khớp tên file, type/rarity hợp lệ, đủ name.vi/en (+ description.vi/en),
// đúng một skin `default` mỗi loại. Test hai bên báo đỏ nếu bản sinh lệch nguồn.
//
//   node scripts/gen-skins.mjs        (hoặc pnpm gen:skins)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const SRC = at("../../shared/skins/");
const TYPES = ["pen", "box"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const PEN_COMBO_STYLES = ["sticker", "ink", "chalk", "neon", "sparkle"];
const PARTICLES = ["paper", "ink", "chalk", "spark", "star"];
const BOX_EFFECTS = [
  "hatch",
  "fill",
  "crosshatch",
  "dots",
  "scribble",
  "star",
  "stamp",
  "heart",
  "seal",
];

const fail = (msg) => {
  console.error("manifest lỗi: " + msg);
  process.exit(1);
};
const i18n = (obj, where) => {
  if (!obj || typeof obj.vi !== "string" || typeof obj.en !== "string" || !obj.vi || !obj.en)
    fail(`${where} thiếu vi/en`);
};

const skins = [];
for (const type of TYPES) {
  const dir = join(SRC, type);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const m = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const where = `${type}/${f}`;
    if (m.id !== f.replace(/\.json$/, "")) fail(`${where}: id không khớp tên file`);
    if (m.type !== type) fail(`${where}: type phải là ${type}`);
    if (!RARITIES.includes(m.rarity)) fail(`${where}: rarity lạ ${m.rarity}`);
    i18n(m.name, `${where} name`);
    i18n(m.description, `${where} description`);
    if (type === "pen") {
      if (!m.pen || typeof m.pen.width !== "number") fail(`${where}: thiếu pen.width`);
      if (!PEN_COMBO_STYLES.includes(m.combo?.style)) fail(`${where}: combo.style lạ`);
      if (!PARTICLES.includes(m.combo?.particles)) fail(`${where}: combo.particles lạ`);
      if (!m.sfx?.capture || !m.sfx?.combo) fail(`${where}: thiếu sfx.capture/combo`);
    } else {
      if (!BOX_EFFECTS.includes(m.box?.effect)) fail(`${where}: box.effect lạ`);
      if (!PARTICLES.includes(m.box?.particles)) fail(`${where}: box.particles lạ`);
    }
    skins.push(m);
  }
  const defaults = skins.filter((s) => s.type === type && s.default);
  if (defaults.length !== 1) fail(`${type}: phải có đúng một skin default (có ${defaults.length})`);
  if (defaults[0].rarity !== "common") fail(`${type}: skin default phải là common`);
}

const ts =
  "// File sinh tự động bởi scripts/gen-skins.mjs từ shared/skins/**.json — KHÔNG sửa tay.\n" +
  'import type { SkinManifest } from "./skins";\n\n' +
  `export const SKIN_SOURCES: readonly SkinManifest[] = ${JSON.stringify(skins, null, 2)};\n`;
writeFileSync(at("../src/game/skins/catalog.data.ts"), ts);
writeFileSync(at("../../api/app/skins/catalog.json"), JSON.stringify({ skins }, null, 2) + "\n");
console.log(`đã sinh ${skins.length} skin: ${skins.map((s) => s.id).join(", ")}`);
