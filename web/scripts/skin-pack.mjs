// Kiểm tra và đóng gói một thư mục skin thành `<id>.okiaskin.zip` (shared/skins/SPEC.md).
//   node scripts/skin-pack.mjs <thư mục skin> [--out <file.zip>]   (pnpm skin:pack …)
//   node scripts/skin-pack.mjs --check <thư mục | file.zip>         (pnpm skin:validate …)
// Cùng quy tắc với API (app/skins/package.py): lỗi in ra đúng thông điệp admin sẽ thấy.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import JSZip from "jszip";
import {
  PackageError,
  checkFile,
  readPackageDir,
  refs,
  validateManifest,
} from "./lib/skin-schema.mjs";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const target = args.filter((a, i) => !a.startsWith("--") && i !== outIdx + 1)[0];
if (!target) {
  console.error("cách dùng: skin-pack.mjs <thư mục> [--out file.zip] | --check <thư mục|zip>");
  process.exit(2);
}

async function checkZip(file) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(zip.files).filter(
    (n) => !zip.files[n].dir && !n.startsWith("__MACOSX/"),
  );
  const roots = names.includes("skin.json")
    ? [""]
    : [
        ...new Set(
          names.filter((n) => /^[^/]+\/skin\.json$/.test(n)).map((n) => n.split("/")[0] + "/"),
        ),
      ];
  if (!roots.length)
    throw new PackageError("không thấy skin.json (ở gốc zip hoặc trong thư mục cấp 1)");
  const ids = [];
  for (const root of roots) {
    const files = new Map();
    for (const n of names) {
      if (!n.startsWith(root)) {
        if (root === "" || !roots.some((r) => n.startsWith(r)))
          throw new PackageError(`file nằm ngoài gói: ${n}`);
        continue;
      }
      const rel = n.slice(root.length);
      if (rel === "skin.json") continue;
      const key = checkFile(rel, await zip.files[n].async("nodebuffer"));
      if (key) files.set(key, true);
    }
    const raw = JSON.parse(await zip.files[root + "skin.json"].async("string"));
    delete raw.assets;
    const m = validateManifest(raw, new Set(files.keys()), { allowDefault: true });
    const extra = [...files.keys()].filter((k) => !refs(m).includes(k));
    if (extra.length)
      throw new PackageError(`${m.id}: file không được manifest dùng tới: ${extra.join(", ")}`);
    ids.push(m.id);
  }
  return ids;
}

try {
  const path = resolve(target);
  if (checkOnly && path.endsWith(".zip")) {
    const ids = await checkZip(path);
    console.log(`hợp lệ: ${ids.join(", ")}`);
  } else {
    const { manifest, files } = readPackageDir(path);
    if (checkOnly) {
      console.log(
        `hợp lệ: ${manifest.id} (${files.size} file: ${[...files.keys()].join(", ") || "không"})`,
      );
    } else {
      const zip = new JSZip();
      zip.file("skin.json", JSON.stringify(manifest, null, 2) + "\n");
      for (const [k, v] of [...files].sort(([a], [b]) => a.localeCompare(b))) zip.file(k, v);
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const dest = out ?? join(dirname(path), `${manifest.id}.okiaskin.zip`);
      writeFileSync(dest, buf);
      console.log(
        `${basename(dest)}: ${manifest.id}, ${files.size} file, ${(buf.length / 1024).toFixed(1)} KB`,
      );
    }
  }
} catch (e) {
  if (e instanceof PackageError) {
    console.error("gói lỗi: " + e.message);
    process.exit(1);
  }
  throw e;
}
