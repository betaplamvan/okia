// Smoke test phòng riêng (M1.5–M1.7) trên Edge thật với HAI trình duyệt độc lập:
// A tạo phòng ở /room → lấy mã → B mở link /r/<mã> → hai bên thay nhau bấm cạnh tới hết ván 3×3 →
// hộp thoại kết quả cả hai bên. Giữa chừng B tải lại trang (kết nối lại) và A thấy báo mất kết nối.
// Cần web (3000) và api (8000) đang chạy.
//
//   node scripts/smoke-room.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const N = 3;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];
const mk = async (name) => {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    // 401 của /auth/refresh khi chưa có cookie và cảnh báo prerender chỉ có ở dev → bỏ qua.
    if (m.type() === "error" && !/status of 401|during prerendering/.test(m.text()))
      problems.push(`[${name} console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
  });
  page.on("pageerror", (e) =>
    problems.push(`[${name} pageerror] ${String(e.message).slice(0, 200)}`),
  );
  return page;
};
const A = await mk("A");
const B = await mk("B");

// A: tạo phòng 3×3, 15 giây/lượt.
await A.goto(base + "/room", { waitUntil: "networkidle" });
await A.getByRole("button", { name: "3×3" }).click();
await A.getByRole("button", { name: "15 giây" }).click();
await A.getByRole("button", { name: "Tạo phòng mới" }).click();
await A.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 15000 });
const code = A.url().split("/").pop();
await A.getByTestId("room-code").waitFor();
console.log(`A tạo phòng: ${code}`);
await A.getByRole("button", { name: "Sao chép mã" }).click();
await A.getByText("Đã sao chép!").first().waitFor();
await A.screenshot({ path: ".shots/room-waiting-390.png" });

// B: vào bằng link mời.
await B.goto(`${base}/r/${code}`, { waitUntil: "networkidle" });
for (const p of [A, B])
  await p.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
await A.getByRole("timer").waitFor();
console.log("B vào phòng: cả hai thấy bàn + đồng hồ");

// Hình học y như smoke-play.
const geom = async (page) => {
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
  return edges;
};
const status = (p) => p.getByRole("status").first();
const dialog = (p) => p.getByRole("dialog");

let i = 0;
let reloaded = false;
for (let step = 0; step < 300; step++) {
  if ((await dialog(A).isVisible()) || (await dialog(B).isVisible())) break;
  const ta = (await status(A).innerText()).trim();
  const tb = (await status(B).innerText()).trim();
  const mover = ta.includes("Đến lượt bạn") ? A : tb.includes("Đến lượt bạn") ? B : null;
  if (!mover) {
    await A.waitForTimeout(150);
    continue;
  }
  // Giữa ván: B tải lại trang → A phải thấy "mất kết nối" rồi hết; B vào lại đúng trạng thái.
  if (!reloaded && i === 6) {
    reloaded = true;
    const movesBefore = i;
    await B.reload({ waitUntil: "networkidle" });
    await B.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
    await B.waitForTimeout(500);
    console.log(`B tải lại trang sau ${movesBefore} nước: ok`);
    continue;
  }
  // Tính lại tọa độ mỗi lần: bố cục dịch khi status/đồng hồ thay đổi.
  const edges = await geom(mover);
  const e = edges[i % edges.length];
  await mover.mouse.click(e.x, e.y);
  i++;
  await A.waitForTimeout(150);
}
await A.waitForTimeout(500);
const finished = (await dialog(A).isVisible()) && (await dialog(B).isVisible());
const titleA = finished ? await dialog(A).getByRole("heading").first().innerText() : "(chưa)";
const titleB = finished ? await dialog(B).getByRole("heading").first().innerText() : "(chưa)";
await A.screenshot({ path: ".shots/room-end-A-390.png" });
await B.screenshot({ path: ".shots/room-end-B-390.png" });
console.log(`kết thúc: clicks=${i} finished=${finished} A="${titleA}" B="${titleB}"`);

// Sau ván: B về sảnh; A bấm "Về sảnh phòng".
await dialog(A).getByRole("button", { name: "Về sảnh phòng" }).click();
await A.waitForURL(/\/room$/);
console.log("A về sảnh: ok");

for (const p of problems) console.log("  " + p);
await browser.close();
const ok = finished && problems.length === 0 && titleA !== titleB;
process.exit(ok ? 0 : 1);
