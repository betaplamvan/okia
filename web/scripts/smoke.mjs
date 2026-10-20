// Smoke test bằng trình duyệt thật: mở từng URL, chờ hydrate, in lang/title/status, chữ hiển thị
// và mọi lỗi console / lỗi trang (kể cả lỗi hydration). Dùng Edge đã cài (channel msedge).
//
//   SMOKE_LOCALE=vi-VN node scripts/smoke.mjs http://localhost:3000 / /en /khong-ton-tai
//
// Server phải đang chạy sẵn (pnpm start hoặc pnpm dev). SMOKE_LOCALE giả lập
// Accept-Language của trình duyệt (mặc định vi-VN). Thoát mã 1 nếu thiếu lang hoặc có lỗi.
import { chromium } from "playwright";

const [base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/", "/en"];
const locale = process.env.SMOKE_LOCALE ?? "vi-VN";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale, viewport: { width: 390, height: 844 } });

const problems = [];
// Thông báo chỉ có ở next dev khi route gọi notFound() (docs/11): không phải lỗi của app.
const DEV_ONLY_NOISE = [/Could not validate `instant`/, /Failed to load resource.*404/];
const isNoise = (text) => DEV_ONLY_NOISE.some((re) => re.test(text));
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    if (!isNoise(msg.text()))
      problems.push(`[console.${msg.type()}] ${msg.text().split("\n")[0].slice(0, 200)}`);
  }
});
page.on("pageerror", (err) => {
  problems.push(`[pageerror] ${String(err.message).split("\n")[0].slice(0, 200)}`);
});

let failed = false;
console.log(`browser locale: ${locale}`);
for (const path of targets) {
  problems.length = 0;
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
  // Trang cố ý trả 404 thì trình duyệt luôn log "Failed to load resource: 404" — không phải lỗi.
  const real = problems.filter((p) => !(status === 404 && /Failed to load resource.*404/.test(p)));
  for (const p of real) console.log(`  ${p}`);
  if (!lang || real.length) failed = true;
}

await browser.close();
process.exit(failed ? 1 : 0);
