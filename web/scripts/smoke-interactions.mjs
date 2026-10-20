// Smoke test tương tác: đổi ngôn ngữ VI ↔ EN bằng nút trên header (root layout remount),
// điều hướng client-side, tải lại. Bắt mọi lỗi console / lỗi trang (kể cả lỗi hydration).
// Dùng Edge đã cài (channel msedge).
//
//   node scripts/smoke-interactions.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 390, height: 844 } });

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
page.on("pageerror", (err) => problems.push(`[pageerror] ${String(err.message).slice(0, 200)}`));

const lang = () => page.evaluate(() => document.documentElement.lang);
// Nút đổi ngôn ngữ hiện ngôn ngữ CÒN LẠI; chọn chính xác để không trúng nút của Next dev tools.
const switchBtn = (label) =>
  page.getByRole("button", { name: new RegExp(`(Chuyển sang|Switch to) ${label}$`) });
const step = async (name, fn) => {
  const before = problems.length;
  await fn();
  const added = problems.slice(before);
  console.log(
    `${added.length ? "✗" : "✓"} ${name} (lang=${await lang()}, url=${page.url().replace(base, "")})`,
  );
  for (const p of added) console.log(`    ${p}`);
};

await step("mở /", () => page.goto(base + "/", { waitUntil: "networkidle" }));
await step("đổi sang EN", async () => {
  await switchBtn("EN").click();
  await page.waitForURL(/\/en(\/|$)/);
  await page.waitForLoadState("networkidle");
});
await step("đổi lại VI", async () => {
  await switchBtn("VI").click();
  await page.waitForURL((u) => !/\/en(\/|$)/.test(u.pathname));
  await page.waitForLoadState("networkidle");
});
await step("đổi sang EN lần 2", async () => {
  await switchBtn("EN").click();
  await page.waitForURL(/\/en(\/|$)/);
  await page.waitForLoadState("networkidle");
});
await step("tải lại trang", () => page.reload({ waitUntil: "networkidle" }));
await step("mở trang 404 rồi về trang chủ", async () => {
  await page.goto(base + "/en/khong-ton-tai", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Back to home|Về trang chủ/ }).click();
  await page.waitForURL((u) => /\/en\/?$/.test(u.pathname));
  await page.waitForLoadState("networkidle");
});

await browser.close();
process.exit(problems.length ? 1 : 0);
