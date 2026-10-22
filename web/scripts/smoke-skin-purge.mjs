// Smoke dọn catalog + nhập lại bundle (docs/08 — "Seed chỉ còn skin default"): admin bấm
// "Xóa tất cả trừ mặc định" → còn 2 skin → nhập bundle 6 skin fixture (mỗi thư mục một gói) với
// tùy chọn "thay toàn bộ catalog" → 8 skin, kho người chơi giữ nguyên.
//   node scripts/smoke-skin-purge.mjs [http://localhost:3000]
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { chromium } from "playwright";
import { ADMIN_EMAIL, ensureShopSkins } from "./lib/shop-fixtures.mjs";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
await ensureShopSkins(apiBase);

// Bundle từ fixture: <id>/skin.json.
const { skins } = JSON.parse(
  readFileSync(new URL("../../shared/fixtures/skins/test-skins.json", import.meta.url), "utf8"),
);
const zip = new JSZip();
for (const m of skins) zip.file(`${m.id}/skin.json`, JSON.stringify(m, null, 2));
const tmp = mkdtempSync(join(tmpdir(), "okia-purge-"));
const bundle = join(tmp, "okia-skins-fixture.zip");
writeFileSync(bundle, await zip.generateAsync({ type: "nodebuffer" }));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 1100, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
page.on("dialog", (d) => d.accept());

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
  { apiBase, email: ADMIN_EMAIL },
);
if (status !== 200) throw new Error(`dev-login admin → ${status}`);
await page.goto(base + "/admin", { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Skin" }).click();
await page.getByText(/\d+ skin trong DB/).waitFor({ timeout: 15000 });

// Xóa tất cả trừ mặc định.
await page.getByTestId("admin-skins-purge").click();
await page.getByText(/Đã xóa \d+ skin/).waitFor({ timeout: 15000 });
await page.getByText("2 skin trong DB").waitFor({ timeout: 10000 });
console.log("xóa tất cả trừ mặc định: còn 2 skin");

// Nhập bundle với "thay toàn bộ": 6 skin fixture → 8 skin.
await page.locator('input[type="file"]').setInputFiles(bundle);
const pv = page.getByTestId("import-preview");
await pv.waitFor({ timeout: 15000 });
for (const m of skins) await pv.getByTestId(`preview-skin-${m.id}`).getByText("Mới").waitFor();
await pv.getByTestId("import-replace").click();
await page.screenshot({ path: ".shots/skin-purge-preview.png" });
await page.getByTestId("import-confirm").click();
await page.getByText(/Đã nhập gói:/).waitFor({ timeout: 15000 });
await page.getByText("8 skin trong DB").waitFor({ timeout: 10000 });
console.log("nhập bundle (thay toàn bộ): 8 skin");

rmSync(tmp, { recursive: true, force: true });
for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
