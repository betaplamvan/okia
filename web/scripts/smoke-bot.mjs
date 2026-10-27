// Smoke ghép máy khi chờ lâu (docs/07): một tài khoản xếp hàng một mình → rời sang trang chủ vẫn
// thấy cửa sổ thu nhỏ "đang tìm", /play bị khóa → sau MM_BOT_AFTER_SECONDS (api/.env local: 5) hộp
// chấp nhận bật lên (đối thủ: Máy) ngay trên trang khác → Chơi luôn → phòng hiện chip "Máy", máy tự
// đi, chơi tới hết ván → hộp kết quả có điểm hạng +34 / −6 (75 % trận cân, Giấy nháp).
//   node scripts/smoke-bot.mjs [http://localhost:3000]
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 420, height: 860 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 401/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
const apiBase = base.replace(/:\d+$/, ":8000");

await page.goto(base + "/", { waitUntil: "networkidle" });
const status = await page.evaluate(async (apiBase) => {
  const r = await fetch(`${apiBase}/auth/dev-login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `bot-smoke-${Date.now()}@example.com`, displayName: "Một Mình" }),
  });
  return r.status;
}, apiBase);
if (status !== 200) throw new Error(`dev-login → ${status}`);
await page.goto(base + "/ranked", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Tìm trận" }).click();
await page.getByTestId("searching").waitFor({ timeout: 10000 });
// Không hiện số người chờ / online.
if (/người đang chờ/.test(await page.getByTestId("searching").innerText()))
  throw new Error("vẫn hiện số người chờ");
console.log("đang tìm: không hiện số người chờ/online");
// Rời trang: cửa sổ thu nhỏ ở trang chủ, /play bị khóa.
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.getByTestId("search-pill").waitFor({ timeout: 10000 });
await page.goto(base + "/play", { waitUntil: "networkidle" });
await page.getByTestId("play-locked").waitFor({ timeout: 10000 });
console.log("rời trang: vẫn tìm (cửa sổ thu nhỏ), /play bị khóa");
// Ghép máy → hộp chấp nhận ngay tại /play.
await page.getByTestId("accept-dialog").waitFor({ timeout: 30000 });
await page.getByTestId("accept-bot").waitFor();
await page.screenshot({ path: ".shots/bot-accept.png" });
await page.getByTestId("accept-match").click();
await page.waitForURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 30000 });
const botChip = page.getByText("Máy · ít điểm hạng hơn");
await botChip.waitFor({ timeout: 10000 });
console.log("ghép máy sau khi chờ:", page.url());

// Chơi: khi tới lượt mình, bấm ngẫu nhiên quanh bàn; máy tự đi. Tối đa 3 phút.
const canvas = page.getByRole("application").locator("canvas");
await canvas.waitFor({ timeout: 20000 });
const box = await canvas.boundingBox();
const statusEl = page.getByRole("status").first();
const t0 = Date.now();
let botMoves = 0;
while (Date.now() - t0 < 180_000) {
  if (await page.getByRole("dialog").isVisible()) break;
  const text = (await statusEl.innerText()).trim();
  if (/Đến lượt bạn/.test(text)) {
    const x = box.x + box.width * (0.08 + Math.random() * 0.84);
    const y = box.y + box.height * (0.08 + Math.random() * 0.84);
    await page.mouse.click(x, y);
    await page.waitForTimeout(80);
  } else {
    botMoves++;
    await page.waitForTimeout(150);
  }
}
const dialog = page.getByRole("dialog");
await dialog.waitFor({ timeout: 15000 });
const txt = await dialog.innerText();
const m = txt.match(/([+−-]\d+)/);
console.log(
  "kết quả:",
  txt.split("\n")[0],
  "| điểm:",
  m ? m[1] : "?",
  "| máy đã đi (nhịp chờ):",
  botMoves > 0,
);
if (!/^(\+34|−6|-6|\+0|0)$/.test(m ? m[1] : ""))
  problems.push("điểm hạng không phải 75 % trận cân (+34 / −6): " + (m ? m[1] : "?"));
await page.screenshot({ path: ".shots/bot-match-result.png" });

for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
