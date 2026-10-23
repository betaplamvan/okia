// Smoke độ bền kết nối (docs/04 — Kết nối lại): A và B vào phòng riêng 15 giây/lượt → tới lượt B
// → B mất mạng 20 giây → A thấy "mất kết nối"; qua hạn lượt KHÔNG có nước đi hộ → B có mạng lại →
// tự nối lại, A thấy online, B đi được → B rời hẳn (đóng context) → tới hạn lượt A thấy đếm ngược
// "bạn thắng sau N giây" → A sang trang chủ có ô "Bạn đang dở một trận — Vào lại" → về đúng phòng.
// Cần web (3000) + api (8000) local.   node scripts/smoke-reconnect.mjs [http://localhost:3000]
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];

async function page(viewport = { width: 1000, height: 900 }) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
  return { ctx, p };
}
const statusText = (p) => p.getByRole("status").first().innerText();
const myTurn = async (p) => (await statusText(p)).includes("Đến lượt bạn");

/** Vẽ cạnh còn trống trên bàn 5×5 cho tới khi hết lượt (ăn ô thì đi tiếp). */
async function playOne(p) {
  const box = await p.getByRole("application").locator("canvas").boundingBox();
  const N = 5;
  const size = Math.min(box.width, box.height);
  const pad = size * 0.02;
  const cell = (size - pad * 2) / (N + 1.3);
  const offX = box.x + (box.width - N * cell) / 2;
  const offY = box.y + (box.height - N * cell) / 2;
  const edges = [];
  for (let r = 0; r <= N; r++)
    for (let c = 0; c < N; c++) edges.push({ x: offX + (c + 0.5) * cell, y: offY + r * cell });
  for (let r = 0; r < N; r++)
    for (let c = 0; c <= N; c++) edges.push({ x: offX + c * cell, y: offY + (r + 0.5) * cell });
  for (let i = 0; i < edges.length; i++) {
    if (!(await myTurn(p))) return;
    await p.mouse.click(edges[i].x, edges[i].y);
    await p.waitForTimeout(250);
  }
}

try {
  const { p: A } = await page();
  const { ctx: ctxB, p: B } = await page({ width: 390, height: 844 });
  await A.goto(base + "/room", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "15 giây" }).click();
  await A.getByRole("button", { name: "Tạo phòng mới" }).click();
  await A.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 15000 });
  const code = A.url().split("/").pop();
  await B.goto(base + `/r/${code}`, { waitUntil: "networkidle" });
  await A.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  await B.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  await A.getByRole("timer").waitFor();
  console.log(`phòng ${code} (15 giây/lượt)`);

  if (await myTurn(A)) await playOne(A);
  await B.getByText("Đến lượt bạn").waitFor({ timeout: 15000 });

  // B mất mạng 20 giây (quá hạn lượt 15 giây): A thấy mất kết nối; KHÔNG có nước đi hộ.
  const t0 = Date.now();
  await ctxB.setOffline(true);
  await A.getByText(/mất kết nối/).waitFor({ timeout: 70000 });
  console.log(`B mất mạng: A thấy "mất kết nối" sau ${Math.round((Date.now() - t0) / 1000)} giây`);
  await A.waitForTimeout(20000);
  if (await myTurn(A)) problems.push("qua hạn lượt mà server vẫn đi hộ B (lượt chuyển sang A)");
  console.log("qua hạn lượt: vẫn là lượt B, không bị đi hộ");

  // B có mạng lại → nối lại, A thấy online, B được lượt mới và đi được.
  const t1 = Date.now();
  await ctxB.setOffline(false);
  await A.getByText(/mất kết nối/).waitFor({ state: "hidden", timeout: 20000 });
  console.log(`B có mạng: A thấy online sau ${Math.round((Date.now() - t1) / 1000)} giây`);
  await B.getByText("Đến lượt bạn").waitFor({ timeout: 15000 });
  await playOne(B);
  await A.getByText("Đến lượt bạn").waitFor({ timeout: 15000 });
  console.log("B đi được sau khi nối lại; tới lượt A");

  // A đi → lượt B; B rời hẳn → tới hạn lượt A thấy đếm ngược tự thắng.
  await playOne(A);
  await B.getByText("Đến lượt bạn").waitFor({ timeout: 15000 });
  await ctxB.close();
  await A.getByTestId("grace-countdown").waitFor({ timeout: 40000 });
  console.log("B rời hẳn: A thấy —", await A.getByTestId("grace-countdown").innerText());
  await A.screenshot({ path: ".shots/reconnect-grace.png" });

  // A sang trang chủ (tải lại trang): ô "Bạn đang dở một trận" → Vào lại → đúng phòng.
  await A.goto(base + "/", { waitUntil: "networkidle" });
  await A.getByTestId("active-game-pill").waitFor({ timeout: 15000 });
  await A.getByTestId("active-game-pill").getByRole("link").click();
  await A.waitForURL(new RegExp(`/r/${code}$`), { timeout: 15000 });
  await A.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  console.log("trang chủ có ô đang dở trận → Vào lại về đúng phòng");
} finally {
  await browser.close();
}
for (const p of problems) console.log("  LỖI: " + p);
process.exit(problems.length === 0 ? 0 : 1);
