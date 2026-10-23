// Kiểm tra manifest / gói skin theo shared/skins/schema.json + SPEC.md — bản JS của
// api/app/skins/package.py (cùng quy tắc, cùng thông điệp). Dùng bởi gen-skins.mjs, skin-pack.mjs
// và test (src/game/skins/schema.test.ts).
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_PATH = fileURLToPath(
  new URL("../../../shared/skins/schema.json", import.meta.url),
);
export const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

export const MAX_ZIP = 3 * 1024 * 1024;
export const MAX_FILES = 24;
export const MAX_AUDIO = 400 * 1024;
export const MAX_IMAGE = 300 * 1024;
export const ASSET_RE =
  /^(sfx|box|particles|pen|throw)\/[a-z0-9_-]{1,40}\.(webm|mp3|ogg|svg|png|webp)$/;
const DIR_EXTS = {
  sfx: ["webm", "mp3", "ogg"],
  box: ["svg", "png", "webp"],
  particles: ["svg", "png", "webp"],
  pen: ["svg", "png", "webp"],
  throw: ["svg", "png", "webp"],
};
const IGNORED = new Set([
  "readme.md",
  "license",
  "license.md",
  "license.txt",
  "preview.png",
  "preview.webp",
]);
const SVG_FORBIDDEN =
  /<script|\bon[a-z]+\s*=|javascript:|<foreignobject|<!entity|<iframe|<embed|<object|href\s*=\s*["'](?!#)/i;
const REF_PATHS = [
  ["pen", "texture"],
  ["combo", "particleImage"],
  ["box", "image"],
  ["box", "particleImage"],
  ["sfx", "capture"],
  ["sfx", "combo"],
  ["throw", "image"],
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export class PackageError extends Error {}

/** Mọi tham chiếu file trong gói mà manifest dùng. */
export function refs(m) {
  const out = [];
  for (const [block, key] of REF_PATHS) {
    const v = m?.[block]?.[key];
    if (typeof v === "string" && ASSET_RE.test(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Ném PackageError (thông điệp như API). `files`: tên file có trong gói. */
export function validateManifest(raw, files = new Set(), { allowDefault = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new PackageError("manifest phải là một object JSON");
  if (!validateSchema(raw)) {
    const e = [...validateSchema.errors].sort((a, b) =>
      a.instancePath.localeCompare(b.instancePath),
    )[0];
    const where = e.instancePath.replace(/^\//, "") || "(gốc)";
    const extra = e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : "";
    throw new PackageError(`${where}: ${e.message}${extra}`);
  }
  const m = JSON.parse(JSON.stringify(raw));
  if (!m.id.startsWith(m.type + "_")) throw new PackageError(`id phải bắt đầu bằng ${m.type}_`);
  if (m.default && !allowDefault)
    throw new PackageError("gói nhập từ ngoài không được đặt default");
  if (m.type === "pen") {
    if (m.forms.mine.color.toLowerCase() === m.forms.opponent.color.toLowerCase())
      throw new PackageError("forms.mine và forms.opponent phải khác màu chính");
  }
  for (const ref of refs(m))
    if (!files.has(ref)) throw new PackageError(`thiếu file ${ref} trong gói`);
  return m;
}

/** Kiểm tra một file asset: tên, thư mục / đuôi, chữ ký, kích thước. Trả về "" nếu là file bỏ qua. */
export function checkFile(rel, data) {
  if (IGNORED.has(rel.toLowerCase())) return "";
  if (!ASSET_RE.test(rel)) throw new PackageError(`tên file không hợp lệ: ${rel}`);
  const folder = rel.split("/")[0];
  const ext = rel.split(".").pop();
  if (!DIR_EXTS[folder].includes(ext))
    throw new PackageError(`${rel}: thư mục ${folder}/ không nhận .${ext}`);
  const head = data.subarray(0, 16);
  let ok = true;
  if (ext === "png")
    ok = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  else if (ext === "webp")
    ok = head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP";
  else if (ext === "svg") {
    const text = data.toString("utf8");
    ok = text.slice(0, 4096).toLowerCase().includes("<svg");
    if (ok && SVG_FORBIDDEN.test(text))
      throw new PackageError(`${rel}: SVG chứa script / tham chiếu ngoài`);
  } else if (ext === "webm") ok = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  else if (ext === "mp3")
    ok =
      head.subarray(0, 3).toString() === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  else if (ext === "ogg") ok = head.subarray(0, 4).toString() === "OggS";
  if (!ok) throw new PackageError(`${rel}: nội dung không đúng định dạng ${ext}`);
  const limit = folder === "sfx" ? MAX_AUDIO : MAX_IMAGE;
  if (data.length > limit) throw new PackageError(`${rel}: quá ${Math.round(limit / 1024)} KB`);
  return rel;
}

/** Đọc một thư mục gói: {manifest, files: Map<rel, Buffer>} đã kiểm tra đầy đủ. */
export function readPackageDir(dir, opts = {}) {
  const files = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = relative(dir, p).split("\\").join("/");
        if (rel === "skin.json") continue;
        const key = checkFile(rel, readFileSync(p));
        if (key) files.set(key, readFileSync(p));
      }
    }
  };
  walk(dir);
  if (files.size > MAX_FILES) throw new PackageError(`quá ${MAX_FILES} file`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(join(dir, "skin.json"), "utf8"));
  } catch (e) {
    throw new PackageError(`skin.json không đọc được: ${e.message}`);
  }
  if (raw && typeof raw === "object") delete raw.assets;
  const manifest = validateManifest(raw, new Set(files.keys()), opts);
  const used = new Set(refs(manifest));
  const extra = [...files.keys()].filter((k) => !used.has(k)).sort();
  if (extra.length)
    throw new PackageError(
      `${manifest.id}: file không được manifest dùng tới: ${extra.join(", ")}`,
    );
  return { manifest, files };
}
