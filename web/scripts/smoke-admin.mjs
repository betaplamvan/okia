// Smoke trang quản trị (docs/13 — Admin): đăng nhập dev-login bằng email admin (api/.env:
// ADMIN_EMAILS=ducquank52t1@gmail.com), nút "Quản trị" trong hồ sơ → /admin → 4 tab hoạt động.
//   node scripts/smoke-admin.mjs [http://localhost:3000]
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 1100, height: 900 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 401|403/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

const apiBase = base.replace(/:\d+$/, ":8000");

async function devLogin(email) {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const status = await page.evaluate(
    async ({ apiBase, email }) => {
      const r = await fetch(`${apiBase}/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return r.status;
    },
    { apiBase, email },
  );
  if (status !== 200) throw new Error(`dev-login ${email} → ${status}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => /Bạn [0-9a-f]{6}|ducquan|thuong/.test(document.body.innerText),
    null,
    {
      timeout: 15000,
    },
  );
}

// Người thường: không thấy nút Quản trị, vào /admin bị chặn.
await devLogin("thuong-smoke@example.com");
await page.getByTestId("player-pill").click();
await page.getByRole("dialog").waitFor();
if (await page.getByTestId("admin-link").isVisible())
  throw new Error("người thường thấy nút Quản trị");
if (await page.getByTestId("admin-home-link").isVisible())
  throw new Error("người thường thấy nút khiên ở trang chủ");
await page.keyboard.press("Escape");
await page.goto(base + "/admin", { waitUntil: "networkidle" });
await page.getByText("chỉ dành cho quản trị viên").waitFor({ timeout: 10000 });
console.log("người thường: bị chặn ở /admin");

// Admin.
await devLogin("ducquank52t1@gmail.com");
await page.getByTestId("admin-home-link").waitFor({ timeout: 10000 }); // nút khiên trang chủ
await page.getByTestId("player-pill").click();
await page.getByRole("dialog").waitFor();
await page.getByTestId("admin-link").click();
await page.waitForURL(/\/admin$/, { timeout: 10000 });
await page.getByRole("tab", { name: "Thống kê" }).waitFor();
await page.getByText("Tài khoản thật").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/admin-stats.png" });
console.log("thống kê: ok");

await page.getByRole("tab", { name: "Người chơi" }).click();
await page.getByPlaceholder("Tên, email hoặc id").fill("thuong-smoke");
await page.getByRole("button", { name: "Tìm" }).click();
const row = page.getByTestId("admin-users").getByText("thuong-smoke@example.com").first();
await row.waitFor({ timeout: 10000 });
await row.click();
await page.getByTestId("admin-user-detail").waitFor();
await page.getByPlaceholder("Ruột chì").first().fill("25");
await page.getByRole("button", { name: "Thực hiện" }).click();
await page.getByText("Đã cập nhật ví").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/admin-users.png" });
console.log("người chơi: tìm + cộng 25 Ruột chì ok");

await page.getByRole("tab", { name: "Skin" }).click();
await page.getByText(/\d+ skin trong DB/).waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Thêm skin" }).click();
await page.getByRole("dialog").getByRole("textbox").waitFor();
await page.keyboard.press("Escape");
await page.screenshot({ path: ".shots/admin-skins.png" });
console.log("skin: danh sách + hộp thêm ok");

await page.getByRole("tab", { name: "Thông số" }).click();
await page.getByText("Ruột chì cho người thắng trận xếp hạng").waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Lưu" }).first().click();
await page.getByText("Đã lưu").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/admin-config.png" });
console.log("thông số: lưu ok");

for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
