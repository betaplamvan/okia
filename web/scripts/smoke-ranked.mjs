// Smoke test xếp hạng (M2.2–M2.4) trên Edge thật với HAI trình duyệt độc lập:
// A và B đăng nhập (dev-login) → /ranked thấy "Đang phân hạng" → cả hai bấm "Tìm trận" → worker ghép →
// cùng vào /r/<id> (huy hiệu hạng trên chip) → chơi hết ván trên map ngẫu nhiên → hộp kết quả có
// "Điểm hạng" +24 / −16 và +30 Ruột chì cho người thắng → "Tìm trận mới" về /ranked với thẻ hạng đã
// cập nhật → tab Hạng trong hồ sơ có lịch sử → /leaderboard mở được.
// Cần web (3000) và api (8000, ngoài production để có /auth/dev-login) đang chạy.
//
//   node scripts/smoke-ranked.mjs http://localhost:3000
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const MAPS = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../shared/maps/maps.json", import.meta.url)), "utf8"),
).maps;
const stamp = Date.now().toString(36);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];

const mk = async (name) => {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 401|during prerendering/.test(m.text()))
      problems.push(`[${name} console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
  });
  page.on("pageerror", (e) =>
    problems.push(`[${name} pageerror] ${String(e.message).slice(0, 200)}`),
  );
  return page;
};

async function devLogin(page, email) {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const status = await page.evaluate(async (email) => {
    const apiBase = `${location.protocol}//${location.hostname}:8000`;
    const headers = { "content-type": "application/json" };
    const r0 = await fetch(`${apiBase}/auth/refresh`, { method: "POST", credentials: "include" });
    if (r0.ok) headers.authorization = `Bearer ${(await r0.json()).accessToken}`;
    const r = await fetch(`${apiBase}/auth/dev-login`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ email, displayName: email.split("@")[0] }),
    });
    return r.status;
  }, email);
  if (status !== 200) throw new Error(`dev-login ${email} → ${status}`);
}

const A = await mk("A");
const B = await mk("B");
await devLogin(A, `an-${stamp}@example.com`);
await devLogin(B, `binh-${stamp}@example.com`);

// /ranked: thẻ hạng "Đang phân hạng", nút Tìm trận.
for (const p of [A, B]) {
  await p.goto(base + "/ranked", { waitUntil: "networkidle" });
  await p.getByTestId("rank-points").waitFor({ timeout: 15000 });
  await p.getByText("Đang phân hạng").first().waitFor();
}
await A.screenshot({ path: ".shots/ranked-idle-390.png" });
console.log("ranked: thẻ hạng + phân hạng: ok");

// A tìm trước → thấy hộp đang tìm; B tìm → cả hai được ghép vào cùng phòng.
await A.getByTestId("find-match").click();
await A.getByTestId("searching").waitFor({ timeout: 10000 });
await A.getByText(/Đã chờ \d+ giây/).waitFor();
await A.screenshot({ path: ".shots/ranked-searching-390.png" });
console.log("A đang tìm: ok");
await B.getByTestId("find-match").click();
// Ghép xong → hộp chấp nhận với vòng đếm ngược ở cả hai; A nhận trước, B thấy "đã sẵn sàng" rồi nhận.
await A.getByTestId("accept-dialog").waitFor({ timeout: 20000 });
await B.getByTestId("accept-dialog").waitFor({ timeout: 20000 });
await A.screenshot({ path: ".shots/ranked-accept-390.png" });
await A.getByTestId("accept-match").click();
await A.getByText("Đang chờ người chơi khác").waitFor();
await B.getByText(/Đối thủ đã sẵn sàng/).waitFor();
await B.getByTestId("accept-match").click();
console.log("chấp nhận trận: ok (A nhận trước, B nhận sau)");
await Promise.all([
  A.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 20000 }),
  B.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 20000 }),
]);
const code = A.url().split("/").pop();
if (B.url().split("/").pop() !== code) problems.push("A và B vào hai phòng khác nhau");
console.log(`ghép trận: phòng ${code}`);

for (const p of [A, B])
  await p.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
await A.getByRole("timer").waitFor();
await A.getByText("Trận xếp hạng").waitFor();
// Chip người chơi có huy hiệu hạng (đang phân hạng) ở cả hai phía.
const badges = await A.getByTestId("tier-badge").count();
if (badges < 2) problems.push(`chỉ thấy ${badges} huy hiệu hạng trên chip`);
await A.screenshot({ path: ".shots/ranked-playing-390.png" });

// Hình học bàn theo map đã bốc (đọc tên map trên màn hình → rows/cols trong bể).
const mapName = (await A.getByTestId("map-name").innerText()).replace(/^Bàn:\s*/, "").trim();
const map = MAPS.find((m) => m.name.vi === mapName);
if (!map) throw new Error(`không nhận ra map "${mapName}"`);
const rows = map.cells.length;
const cols = map.cells[0].length;
console.log(`map: ${map.id} (${rows}×${cols})`);
const geom = async (page) => {
  const box = await page.getByRole("application").locator("canvas").boundingBox();
  const size = Math.min(box.width, box.height);
  const pad = size * 0.02;
  const cell = (size - pad * 2) / (Math.max(rows, cols) + 1.3);
  const offX = box.x + (box.width - cols * cell) / 2;
  const offY = box.y + (box.height - rows * cell) / 2;
  const edges = [];
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c < cols; c++) edges.push({ x: offX + (c + 0.5) * cell, y: offY + r * cell });
  for (let r = 0; r < rows; r++)
    for (let c = 0; c <= cols; c++) edges.push({ x: offX + c * cell, y: offY + (r + 0.5) * cell });
  return edges;
};
const status = (p) => p.getByRole("status").first();
const dialog = (p) => p.getByRole("dialog");

let i = 0;
for (let step = 0; step < 600; step++) {
  if ((await dialog(A).isVisible()) || (await dialog(B).isVisible())) break;
  const ta = (await status(A).innerText()).trim();
  const tb = (await status(B).innerText()).trim();
  const mover = ta.includes("Đến lượt bạn") ? A : tb.includes("Đến lượt bạn") ? B : null;
  if (!mover) {
    await A.waitForTimeout(150);
    continue;
  }
  const edges = await geom(mover);
  const e = edges[i % edges.length];
  await mover.mouse.click(e.x, e.y);
  i++;
  await A.waitForTimeout(120);
}
await A.waitForTimeout(800);
const finished = (await dialog(A).isVisible()) && (await dialog(B).isVisible());
console.log(`kết thúc ván: clicks=${i} finished=${finished}`);
if (!finished) problems.push("ván không kết thúc");

// Hộp kết quả: Điểm hạng ±, người thắng +30 Ruột chì.
const deltas = {};
for (const [name, p] of [
  ["A", A],
  ["B", B],
]) {
  await dialog(p).getByTestId("ranked-result").waitFor({ timeout: 5000 });
  deltas[name] = (await dialog(p).getByTestId("points-delta").innerText()).trim();
  await p.screenshot({ path: `.shots/ranked-end-${name}-390.png` });
}
console.log(`điểm hạng: A ${deltas.A}, B ${deltas.B}`);
const sorted = Object.values(deltas).sort();
if (sorted.join(" ") !== "+24 -16" && sorted.join(" ") !== "-16 +24")
  problems.push(`điểm hạng không như kỳ vọng (+24 / -16): ${JSON.stringify(deltas)}`);
const winner = deltas.A === "+24" ? A : B;
const loser = winner === A ? B : A;
if (!(await dialog(winner).getByText("30").first().isVisible()))
  problems.push("người thắng không thấy +30 Ruột chì");

// Người thắng: "Tìm trận mới" → /ranked, thẻ hạng 24 điểm, còn 4 trận phân hạng.
await dialog(winner).getByRole("button", { name: "Tìm trận mới" }).click();
await winner.waitForURL(/\/ranked$/, { timeout: 10000 });
const main = winner.getByRole("main");
await main.getByText("Còn 4 trận phân hạng").waitFor({ timeout: 10000 });
const pts = (await main.getByTestId("rank-points").innerText()).trim();
if (pts !== "24") problems.push(`thẻ hạng người thắng hiện ${pts} điểm, kỳ vọng 24`);
await winner.waitForTimeout(500);
await winner.screenshot({ path: ".shots/ranked-after-390.png" });
// Hộp kết quả của phòng cũ không được còn hiện trên /ranked.
if (await winner.getByTestId("ranked-result").isVisible())
  problems.push("hộp kết quả phòng cũ vẫn hiện trên /ranked");
console.log("về /ranked sau ván: ok (24 điểm, còn 4 trận phân hạng)");

// Người thua: hồ sơ → tab Hạng → lịch sử có 1 trận "Thua" −16; ví người thắng 30 Ruột chì.
await dialog(loser).getByRole("link", { name: "Trang chủ" }).click();
await loser.waitForURL(/\/$/, { timeout: 10000 });
await loser.getByTestId("player-pill").click();
const dlg = loser.getByRole("dialog");
await dlg.getByRole("tab", { name: "Hạng" }).click();
await dlg.getByText("Trận gần đây").waitFor({ timeout: 10000 });
await dlg.getByText("Thua", { exact: true }).first().waitFor();
await dlg.getByText("-16").waitFor();
await loser.screenshot({ path: ".shots/ranked-profile-tab-390.png" });
console.log("tab Hạng trong hồ sơ: ok (1 trận thua −16)");
await winner.getByTestId("user-button").click();
await winner.getByRole("dialog").getByText("30").first().waitFor({ timeout: 10000 });
console.log("ví người thắng: 30 Ruột chì");

// Bảng xếp hạng mở được (chưa ai qua phân hạng → thông điệp trống).
await winner.goto(base + "/leaderboard", { waitUntil: "networkidle" });
await winner.getByRole("heading", { name: "Bảng xếp hạng" }).waitFor();
await winner
  .getByText(/Chưa ai qua 5 trận phân hạng|^\d+$/)
  .first()
  .waitFor({ timeout: 10000 });
await winner.screenshot({ path: ".shots/leaderboard-390.png" });
console.log("leaderboard: ok");

// Lỗi 2026-10-23 (Hoàng & Mi): đánh xong một ván, cả hai tìm lại → phải gặp lại NHAU (không phải
// mỗi người một máy ở giây 45), và bấm chấp nhận CÙNG LÚC vẫn vào được phòng.
for (const p of [A, B]) {
  await p.goto(base + "/ranked", { waitUntil: "networkidle" });
  await p.getByTestId("find-match").click();
}
const t0 = Date.now();
await Promise.all([
  A.getByTestId("accept-dialog").waitFor({ timeout: 40000 }),
  B.getByTestId("accept-dialog").waitFor({ timeout: 40000 }),
]);
const waitedS = Math.round((Date.now() - t0) / 1000);
for (const p of [A, B])
  if (await p.getByTestId("accept-dialog").getByText(/Máy/).count())
    problems.push("tìm lại sau ván: bị ghép với máy");
await Promise.all([A.getByTestId("accept-match").click(), B.getByTestId("accept-match").click()]);
await Promise.all([
  A.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 20000 }),
  B.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 20000 }),
]);
if (A.url() !== B.url()) problems.push("tìm lại sau ván: A và B vào hai phòng khác nhau");
console.log(`tìm lại sau ván: gặp lại nhau sau ~${waitedS} giây, chấp nhận cùng lúc → chung phòng`);

for (const p of problems) console.log("  LỖI: " + p);
await browser.close();
process.exit(problems.length === 0 && finished ? 0 : 1);
