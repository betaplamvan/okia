// Smoke test màn chơi với máy: tự chơi hết một ván 3×3 bằng cách bấm lên canvas,
// kiểm tra điểm, hộp thoại kết quả và lỗi console. Dùng Edge đã cài (channel msedge).
//
//   node scripts/smoke-play.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const N = 3;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 390, height: 844 } });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error")
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.getByRole("link", { name: /Chơi với máy/ }).click();
await page.waitForURL(/\/play$/);
await page.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
await page.getByRole("button", { name: `${N}×${N}` }).click();
await page.waitForTimeout(300);

// Hình học y như BoardRenderer.layout(): size = min(w,h), pad = 9%, cell = (size - 2pad)/N.
const box = await page.getByRole("application").locator("canvas").boundingBox();
const size = Math.min(box.width, box.height);
const pad = size * 0.09;
const cell = (size - pad * 2) / N;
const offX = box.x + (box.width - N * cell) / 2;
const offY = box.y + (box.height - N * cell) / 2;
const edges = [];
for (let r = 0; r <= N; r++)
  for (let c = 0; c < N; c++) edges.push({ x: offX + (c + 0.5) * cell, y: offY + r * cell });
for (let r = 0; r < N; r++)
  for (let c = 0; c <= N; c++) edges.push({ x: offX + c * cell, y: offY + (r + 0.5) * cell });

const status = page.getByRole("status");
const dialog = page.getByRole("dialog");
const scoreOf = async (name) => {
  const txt = await page.getByText(name, { exact: true }).locator("..").innerText();
  return Number(txt.replace(/\D+/g, " ").trim().split(" ").pop());
};

let clicks = 0;
let shot = false;
for (let i = 0; i < 200; i++) {
  if (await dialog.isVisible()) break;
  const text = (await status.innerText()).trim();
  if (!text.includes("Đến lượt bạn")) {
    await page.waitForTimeout(150);
    continue;
  }
  const e = edges[i % edges.length];
  await page.mouse.click(e.x, e.y);
  clicks++;
  await page.waitForTimeout(120);
  if (!shot && clicks === 6) {
    await page.screenshot({ path: ".shots/play-mid-390.png" });
    shot = true;
  }
}

const finished = await dialog.isVisible();
const title = finished ? await dialog.getByRole("heading").first().innerText() : "(chưa kết thúc)";
const you = await scoreOf("Bạn");
const bot = await scoreOf("Máy");
await page.screenshot({ path: ".shots/play-end-390.png" });
console.log(
  `clicks=${clicks} finished=${finished} title="${title}" score=${you}-${bot} sum=${you + bot}`,
);
for (const p of problems) console.log("  " + p);

// Chơi lại từ hộp thoại kết quả → bàn trống, điểm 0-0.
if (finished) {
  await dialog.getByRole("button", { name: "Chơi lại" }).click();
  await page.waitForTimeout(300);
  console.log(
    `sau "Chơi lại": score=${await scoreOf("Bạn")}-${await scoreOf("Máy")} dialog=${await dialog.isVisible()}`,
  );
}

// Đổi kích thước liên tiếp sau khi đã chơi (từng gây lỗi khi renderer bị tạo lại).
for (const n of [7, 3, 7, 5]) {
  await page.getByRole("button", { name: `${n}×${n}` }).click();
  await page.waitForTimeout(250);
  await page.mouse.click(offX + cell * 0.5, offY);
  await page.waitForTimeout(200);
}
console.log(`đổi kích thước 7/3/7/5: lỗi=${problems.length}`);

await browser.close();
const ok = finished && you + bot === N * N && problems.length === 0;
process.exit(ok ? 0 : 1);
