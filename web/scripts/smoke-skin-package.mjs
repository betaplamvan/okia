// Smoke gói skin (ADR-0014, shared/skins/SPEC.md): đóng gói hai gói mẫu bằng skin-pack.mjs → admin
// nhập qua ô chọn file ở tab Skin → thẻ có nhãn "gói · n file" → /shop: Thử cả hai skin (ảnh ô, vụn
// ảnh, texture nét, tiếng trong gói được tải 200 từ /skins/assets) → xuất gói tải về đúng tên → xóa.
// Cần web (3000) và api (8000, S3 trống → MemoryStorage) đang chạy; dev-login admin theo api/.env.
//   node scripts/smoke-skin-package.mjs [http://localhost:3000]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
const ADMIN = "ducquank52t1@gmail.com";
const tmp = mkdtempSync(join(tmpdir(), "okia-skin-smoke-"));
const zips = ["pen_example", "box_example"].map((id) => {
  const out = join(tmp, `${id}.okiaskin.zip`);
  execFileSync(process.execPath, [
    "scripts/skin-pack.mjs",
    `../shared/skins/_template/${id}`,
    "--out",
    out,
  ]);
  return out;
});
console.log(
  "đóng gói:",
  zips.map((z) => `${z.split(/[\\/]/).pop()} ${readFileSync(z).length} B`).join(", "),
);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({
  locale: "vi-VN",
  viewport: { width: 1100, height: 900 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
const problems = [];
const assetHits = new Map();
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 40[13]/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/skins/assets/")) assetHits.set(u.split("/skins/assets/")[1], r.status());
});

// Admin.
await page.goto(base + "/", { waitUntil: "networkidle" });
const status = await page.evaluate(
  async ({ apiBase, email }) => {
    const r = await fetch(`${apiBase}/auth/dev-login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return r.status;
  },
  { apiBase, email: ADMIN },
);
if (status !== 200) throw new Error(`dev-login admin → ${status}`);
await page.goto(base + "/admin", { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Skin" }).click();
await page.getByText(/\d+ skin trong DB/).waitFor({ timeout: 15000 });

// Nhập hai gói qua ô chọn file (ẩn).
for (const z of zips) {
  await page.locator('input[type="file"]').setInputFiles(z);
  await page.getByText(/Đã nhập gói: (pen|box)_example\./).waitFor({ timeout: 15000 });
}
await page.getByTestId("admin-skin-pen_example").getByTestId("admin-skin-package").waitFor();
const penBadge = await page
  .getByTestId("admin-skin-pen_example")
  .getByTestId("admin-skin-package")
  .innerText();
if (!/4 file/.test(penBadge)) problems.push("nhãn gói bút sai: " + penBadge);
await page.getByRole("button", { name: "Dấu ăn" }).click();
await page.getByTestId("admin-skin-box_example").getByTestId("admin-skin-package").waitFor();
await page.screenshot({ path: ".shots/skin-package-admin.png" });
console.log("admin: nhập 2 gói, nhãn gói ok");

// Xem trước tĩnh của thẻ dùng ảnh (mask SVG) → ảnh được tải từ /skins/assets.
await page.getByRole("button", { name: "Bút" }).click();
await page.getByTestId("admin-skin-pen_example").getByRole("button", { name: "Sửa" }).click();
await page.getByRole("dialog").getByText("File trong gói").waitFor();
await page.keyboard.press("Escape");

// Xuất gói → tải về đúng tên, kích thước > 0.
const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 15000 }),
  page.getByTestId("admin-skin-pen_example").getByRole("button", { name: "Xuất gói" }).click(),
]);
const dlPath = join(tmp, dl.suggestedFilename());
await dl.saveAs(dlPath);
const dlSize = readFileSync(dlPath).length;
if (dl.suggestedFilename() !== "pen_example.okiaskin.zip" || dlSize < 1000)
  problems.push(`xuất gói lạ: ${dl.suggestedFilename()} ${dlSize} B`);
execFileSync(process.execPath, ["scripts/skin-pack.mjs", "--check", dlPath]);
console.log("xuất gói:", dl.suggestedFilename(), dlSize, "B (kiểm tra lại hợp lệ)");

// Shop: thử bút (texture nét + vụn ảnh + tiếng gói) rồi thử ô (ảnh ô + vụn ảnh).
await page.goto(base + "/shop", { waitUntil: "networkidle" });
await page.getByTestId("skin-pen_example").waitFor({ timeout: 15000 });
async function tryIt(id, shots) {
  await page.getByTestId(`skin-${id}`).getByRole("button", { name: "Thử" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("application").locator("canvas").waitFor({ timeout: 15000 });
  await page.waitForTimeout(600); // ảnh gói nạp
  for (let i = 0; i < 12; i++) {
    await dlg.getByTestId("try-draw").click();
    await page.waitForTimeout(i === 11 ? 500 : 220);
  }
  await page.screenshot({ path: `.shots/${shots}.png` });
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "hidden" });
}
await tryIt("pen_example", "skin-package-try-pen");
await page.getByRole("tab", { name: "Ô đã ăn" }).click();
await page.getByTestId("skin-box_example").waitFor({ timeout: 15000 });
await tryIt("box_example", "skin-package-try-box");
const expected = [
  "pen/texture.png",
  "particles/shape.svg",
  "sfx/capture.webm",
  "sfx/combo.webm",
  "box/stamp.svg",
];
for (const f of expected) {
  const hit = [...assetHits].find(([k]) => k.endsWith("/" + f));
  if (!hit) problems.push(`không thấy tải ${f}`);
  else if (hit[1] !== 200) problems.push(`${f} → ${hit[1]}`);
}
console.log(
  "shop: thử 2 skin, asset tải:",
  [...assetHits].map(([k, v]) => `${k.split("/").slice(2).join("/")}=${v}`).join(" "),
);

// Dọn: xóa hai skin (xác nhận hộp thoại).
await page.goto(base + "/admin", { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Skin" }).click();
page.on("dialog", (d) => d.accept());
for (const [tab, id] of [
  ["Bút", "pen_example"],
  ["Dấu ăn", "box_example"],
]) {
  await page.getByRole("button", { name: tab }).click();
  await page.getByTestId(`admin-skin-${id}`).getByRole("button", { name: "Xóa" }).click();
  await page.getByTestId(`admin-skin-${id}`).waitFor({ state: "hidden", timeout: 10000 });
}
console.log("dọn: đã xóa 2 skin mẫu");

rmSync(tmp, { recursive: true, force: true });
for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
