// Smoke test ví / điểm danh / nhiệm vụ / avatar (ADR-0010) trên Edge thật.
// Khách: thấy ví 0/0, dải điểm danh + nhiệm vụ nhưng không nhận được. Tài khoản (dev-login):
// tải avatar, chơi một ván với máy → nhiệm vụ "Khởi động" 1/3. Cần web (3000) + api (8000).
//
//   node scripts/smoke-economy.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const email = `econ-${Date.now()}@example.com`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 390, height: 844 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 401/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

const pill = page.getByTestId("player-pill");
const dialog = page.getByRole("dialog");

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => /Bạn [0-9a-f]{6}/.test(document.body.innerText), null, {
  timeout: 15000,
});
// Ví trên nút tiền (một nút vàng: Ruột chì | Hoa điểm tốt) dẫn tới cửa hàng.
const walletPill = page.getByTestId("wallet-pill");
const chips = await walletPill.locator("[title]").allInnerTexts();
console.log("ví trên nút tiền:", chips.map((s) => s.trim()).join(" | "));
if (!(await walletPill.getAttribute("href"))?.endsWith("/shop"))
  throw new Error("nút tiền không dẫn tới /shop");

// Khách bấm hộp quà → hồ sơ mở thẳng tab Nhiệm vụ: điểm danh + nhiệm vụ hiện, nút nhận bị thay
// bằng gợi ý tạo tài khoản. Khách không có chấm đỏ.
if (await page.getByTestId("gift-dot").isVisible()) throw new Error("khách lại có chấm quà");
await page.getByTestId("gift-pill").click();
await dialog.waitFor();
await dialog.getByText("Điểm danh mỗi ngày").waitFor();
await dialog.getByText("Ngày 7").waitFor();
await dialog.getByText("Đăng nhập Google để nhận thưởng").first().waitFor();
await dialog.getByText("Khởi động").waitFor();
await dialog.getByText("Chăm chỉ").waitFor();
await page.screenshot({ path: ".shots/econ-quests-guest-390.png" });
console.log("khách: thấy điểm danh + 6 nhiệm vụ, không có nút Nhận");

// Tài khoản thật qua /auth/dev-login (ngoài production; như đăng nhập Google) để tải avatar
// và nuôi nhiệm vụ. Gọi trong trang để cookie refresh được đặt, rồi tải lại cho store boot.
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" });
const devStatus = await page.evaluate(async (email) => {
  const apiBase = `${location.protocol}//${location.hostname}:8000`;
  const r = await fetch(`${apiBase}/auth/dev-login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return r.status;
}, email);
if (devStatus !== 200) throw new Error(`dev-login → ${devStatus}`);
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => /Bạn [0-9a-f]{6}/.test(document.body.innerText), null, {
  timeout: 15000,
});
// Tài khoản thật chưa điểm danh hôm nay → chấm đỏ trên nút hộp quà.
await page.getByTestId("gift-dot").waitFor({ timeout: 10000 });
console.log("chấm quà: hiện khi còn thưởng chưa nhận");
await pill.click();
await dialog.waitFor();

// Avatar: chọn file → hộp cắt → lưu → ảnh đổi sang .../avatars/<id>/1.webp (MinIO hoặc API).
await dialog.getByRole("button", { name: "Chỉnh sửa hồ sơ" }).click();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8DwnwEIGBmQAFgAAHe9A/1l4m2kAAAAAElFTkSuQmCC",
  "base64",
);
await page
  .getByTestId("avatar-input")
  .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: png });
await page.getByRole("dialog", { name: "Cắt ảnh đại diện" }).waitFor();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Lưu ảnh" }).click();
await page.getByText("Đã đổi ảnh đại diện").waitFor({ timeout: 10000 });
await page.waitForFunction(() =>
  [...document.querySelectorAll("img")].some((i) => /\/avatars\/[0-9a-f-]+\/\d+\.webp/.test(i.src)),
);
console.log("avatar: tải lên, hiện /avatars/<id>/<n>.webp");
await dialog.getByRole("button", { name: "Dùng ảnh mặc định" }).click();
await page.getByText("Đã dùng lại ảnh mặc định").waitFor();
console.log("avatar: xóa về mặc định ok");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" });

// Chơi một ván với máy → nhiệm vụ ngày "Khởi động" 1/3 (POST /me/events).
await page.goto(base + "/play", { waitUntil: "networkidle" });
await page.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
const events = [];
page.on("response", (r) => {
  if (r.url().endsWith("/me/events")) events.push(r.status());
});
await page.waitForTimeout(500);
const box = await page.getByRole("application").locator("canvas").boundingBox();
// Bấm lung tung quanh bàn tới khi có kết quả (bot sẽ đi hộ phần còn lại khi ta bấm cạnh hợp lệ).
const status = page.getByRole("status");
for (let i = 0; i < 400; i++) {
  if (await page.getByRole("dialog").isVisible()) break;
  const text = (await status.innerText()).trim();
  if (!text.includes("Đến lượt bạn")) {
    await page.waitForTimeout(120);
    continue;
  }
  const x = box.x + box.width * (0.1 + Math.random() * 0.8);
  const y = box.y + box.height * (0.1 + Math.random() * 0.8);
  await page.mouse.click(x, y);
  await page.waitForTimeout(90);
}
await page.getByRole("dialog").waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
console.log("ván với máy xong; /me/events →", events.join(",") || "(chưa gọi)");
await page.getByRole("dialog").getByRole("button", { name: "Chơi lại" }).click();

// Hồ sơ: nhiệm vụ "Khởi động" 1/3.
await page.getByTestId("user-button").click();
await dialog.waitFor();
await dialog.getByRole("tab", { name: "Nhiệm vụ" }).click();
await dialog.getByText("1/3").first().waitFor({ timeout: 10000 });
console.log("nhiệm vụ Khởi động: 1/3");
await page.screenshot({ path: ".shots/econ-quests-390.png" });

for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 && events.includes(200) ? 0 : 1);
