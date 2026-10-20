// Sinh type TypeScript cho tin nhắn WebSocket từ shared/ws-schema.json (docs/04, P1-11).
// Nguồn chuẩn là Pydantic ở api/app/ws/messages.py; chạy `uv run python -m scripts.export_ws_schema`
// bên api rồi `pnpm gen:ws` bên web.
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../shared/ws-schema.json", import.meta.url));
const out = fileURLToPath(new URL("../src/game/ws-types.ts", import.meta.url));
const schema = JSON.parse(readFileSync(src, "utf8"));

// Pydantic gắn `title` cho từng thuộc tính → json-schema-to-typescript sinh alias thừa (T, T1…).
// Chỉ giữ title ở các definition gốc.
function stripTitles(node) {
  if (Array.isArray(node)) return node.forEach(stripTitles);
  if (!node || typeof node !== "object") return;
  delete node.title;
  for (const v of Object.values(node)) stripTitles(v);
}
stripTitles(schema.properties);
for (const [name, def] of Object.entries(schema.definitions)) {
  stripTitles(def);
  def.title = name;
  // Pydantic cho `t` có default → không nằm trong required; client cần nó để phân biệt union.
  if (def.properties?.t) def.required = [...new Set([...(def.required ?? []), "t"])];
}

const ts = await compile(schema, "OkiaWs", {
  bannerComment:
    "/* eslint-disable */\n// Sinh tự động từ shared/ws-schema.json — KHÔNG sửa tay. Chạy `pnpm gen:ws`.",
  additionalProperties: false,
  style: { printWidth: 100 },
});
const tail = [
  "",
  "// Union theo chiều gửi (docs/04).",
  'export type ClientMsg = OkiaWs["client"];',
  'export type ServerMsg = OkiaWs["server"];',
  "",
].join("\n");
writeFileSync(out, ts + tail);
console.log("đã ghi src/game/ws-types.ts");
