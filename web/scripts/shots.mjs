// Chụp màn hình từng URL ở 3 bề rộng chuẩn (docs/11 — Kiểm thử) bằng Edge đã cài.
//
//   SMOKE_LOCALE=vi-VN node scripts/shots.mjs http://localhost:3000 / /en /dev/fonts
//
// Ảnh lưu vào .shots/<đường-dẫn>-<bề-rộng>.png (thư mục bị gitignore).
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/"];
const locale = process.env.SMOKE_LOCALE ?? "vi-VN";
const widths = [360, 768, 1440];
const outDir = new URL("../.shots/", import.meta.url);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });

for (const path of targets) {
  const slug = path === "/" ? "home" : path.replace(/^\//, "").replace(/[^\w-]+/g, "_");
  for (const width of widths) {
    const context = await browser.newContext({
      locale,
      viewport: { width, height: Math.round(width * (width < 768 ? 2.1 : 0.7)) },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    // Chờ font tải xong để ảnh phản ánh đúng glyph.
    await page.evaluate(() => document.fonts.ready);
    const file = fileURLToPath(new URL(`${slug}-${width}.png`, outDir));
    await page.screenshot({ path: file, fullPage: true });
    console.log(`saved ${file}`);
    await context.close();
  }
}

await browser.close();
