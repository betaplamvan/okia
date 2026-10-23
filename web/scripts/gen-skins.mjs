// Gom manifest skin shared/skins/{pen,box,throw}/<id>.json (nguồn chuẩn, docs/08) thành catalog cho hai phía:
//   - web/src/game/skins/catalog.data.ts  (bundle client không import được file ngoài web/)
//   - api/app/skins/catalog.json          (image api build với context api/, không thấy shared/)
//   - api/app/skins/schema.json           (bản chép shared/skins/schema.json cho API kiểm tra gói)
// Kiểm tra manifest theo shared/skins/schema.json (ajv, cùng quy tắc với API — lib/skin-schema.mjs):
// id khớp tên file, đúng một skin `default` mỗi loại (bậc common), seed không tham chiếu file ngoài
// (skin có file đi theo gói zip, nhập ở admin — ADR-0014). Test hai bên báo đỏ nếu bản sinh lệch nguồn.
//
//   node scripts/gen-skins.mjs        (hoặc pnpm gen:skins)
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PackageError, SCHEMA_PATH, refs, validateManifest } from "./lib/skin-schema.mjs";

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const SRC = at("../../shared/skins/");
const TYPES = ["pen", "box", "throw"];

const fail = (msg) => {
  console.error("manifest lỗi: " + msg);
  process.exit(1);
};

const skins = [];
for (const type of TYPES) {
  const dir = join(SRC, type);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const where = `${type}/${f}`;
    let m;
    try {
      m = validateManifest(JSON.parse(readFileSync(join(dir, f), "utf8")), new Set(), {
        allowDefault: true,
      });
    } catch (e) {
      if (e instanceof PackageError) fail(`${where}: ${e.message}`);
      throw e;
    }
    if (m.id !== f.replace(/\.json$/, "")) fail(`${where}: id không khớp tên file`);
    if (m.type !== type) fail(`${where}: type phải là ${type}`);
    if (refs(m).length) fail(`${where}: seed không được tham chiếu file (dùng gói zip ở admin)`);
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
copyFileSync(SCHEMA_PATH, at("../../api/app/skins/schema.json"));
console.log(`đã sinh ${skins.length} skin: ${skins.map((s) => s.id).join(", ")}`);
