// Smoke test bằng trình duyệt thật: mở từng URL, chờ hydrate, in lang/title/status và chữ hiển thị.
// Dùng Edge đã cài trên máy (channel msedge) nên không cần tải trình duyệt.
//
//   SMOKE_LOCALE=vi-VN node scripts/smoke.mjs http://localhost:3000 / /en /khong-ton-tai
//
// Server phải đang chạy sẵn (pnpm start hoặc pnpm dev). SMOKE_LOCALE giả lập
// Accept-Language của trình duyệt (mặc định vi-VN) để kiểm tra việc đoán locale.
import { chromium } from "playwright";

const [base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/", "/en"];
const locale = process.env.SMOKE_LOCALE ?? "vi-VN";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale, viewport: { width: 390, height: 844 } });

let failed = false;
console.log(`browser locale: ${locale}`);
for (const path of targets) {
  const response = await page.goto(base + path, { waitUntil: "networkidle" });
  const status = response?.status();
  const finalUrl = page.url().replace(base, "");
  const lang = await page.evaluate(() => document.documentElement.lang);
  const title = await page.title();
  const text = (await page.evaluate(() => document.body.innerText))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  console.log(
    `${path} -> ${finalUrl}\n  status=${status} lang=${lang} title="${title}"\n  text: ${text}`,
  );
  if (!lang) failed = true;
}

await browser.close();
process.exit(failed ? 1 : 0);
