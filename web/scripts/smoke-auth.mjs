// Smoke test xác thực (M1.3) trên Edge thật: vào trang chủ → tự có tài khoản khách → mở hồ sơ →
// đăng ký email (nâng cấp khách) → đổi tên → đăng xuất (về khách mới) → đăng nhập lại → xóa tài khoản.
// Cần web (3000) và api (8000) đang chạy; api nên đặt EMAIL_PROVIDER=console để không gửi email thật.
//
//   node scripts/smoke-auth.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const email = `smoke-${Date.now()}@example.com`;
const password = "giay-o-li-2026!";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 390, height: 844 } });

const problems = [];
page.on("console", (m) => {
  // 401 từ /auth/refresh (chưa có cookie) và đăng nhập sai mật khẩu là cố ý → bỏ qua.
  if (m.type() === "error" && !/status of 401/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

const pill = page.getByTestId("player-pill");
const dialog = page.getByRole("dialog");
const toast = (text) => page.getByText(text, { exact: false }).first();

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => /Bạn [0-9a-f]{6}/.test(document.body.innerText), null, {
  timeout: 15000,
});
const guestName = (await pill.innerText()).match(/Bạn [0-9a-f]{6}/)?.[0];
console.log(`khách: ${guestName}`);

// Mở hồ sơ → tab Tài khoản → Dùng email → đăng ký.
await pill.click();
await dialog.waitFor();
await dialog.getByRole("tab", { name: "Tài khoản" }).click();
await dialog.getByRole("button", { name: /Dùng email/ }).click();
await dialog.getByLabel("Email").fill(email);
await dialog.getByLabel("Mật khẩu").fill(password);
await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
await toast("Đã tạo tài khoản").waitFor({ timeout: 10000 });
await dialog.getByText("Chưa xác minh email").waitFor();
await dialog.getByText(email).waitFor();
await page.screenshot({ path: ".shots/auth-account-390.png" });
console.log("đăng ký: ok (nâng cấp khách, banner chưa xác minh)");

// Đổi tên hiển thị.
await dialog.getByRole("button", { name: "Chỉnh sửa hồ sơ" }).click();
await dialog.getByLabel("Tên hiển thị").fill("Tí Sún");
await dialog.getByRole("button", { name: "Lưu" }).click();
await toast("Đã lưu").waitFor();
await dialog.getByText("Tí Sún", { exact: true }).waitFor();
console.log("đổi tên: ok");

// Đăng xuất → thành khách mới (tên khác).
await dialog.getByRole("button", { name: "Đăng xuất", exact: true }).click();
await dialog.waitFor({ state: "hidden" });
await page.waitForFunction(
  (prev) => {
    const m = document.body.innerText.match(/Bạn [0-9a-f]{6}/);
    return m && m[0] !== prev;
  },
  guestName,
  { timeout: 10000 },
);
console.log(`đăng xuất: ok → khách mới ${(await pill.innerText()).match(/Bạn [0-9a-f]{6}/)?.[0]}`);

// Đăng nhập lại bằng email (khách → chuyển sang tài khoản đã có).
await pill.click();
await dialog.getByRole("tab", { name: "Tài khoản" }).click();
await dialog.getByRole("button", { name: /Dùng email/ }).click();
await dialog.getByRole("button", { name: /Đã có tài khoản/ }).click();
await dialog.getByLabel("Email").fill(email);
await dialog.getByLabel("Mật khẩu").fill("sai-mat-khau-123");
await dialog.getByRole("button", { name: "Đăng nhập", exact: true }).click();
await toast("Email hoặc mật khẩu không đúng").waitFor();
await dialog.getByLabel("Mật khẩu").fill(password);
await dialog.getByRole("button", { name: "Đăng nhập", exact: true }).click();
await toast("Đã chuyển sang tài khoản").waitFor({ timeout: 10000 });
await dialog.getByText("Tí Sún", { exact: true }).waitFor();
console.log("đăng nhập lại: ok (sai mật khẩu báo lỗi, đúng thì chuyển tài khoản)");

// Tải lại trang: phiên giữ nhờ refresh cookie.
await page.reload({ waitUntil: "networkidle" });
await page.getByText("Tí Sún").first().waitFor({ timeout: 10000 });
console.log("tải lại trang: vẫn đăng nhập");

// Xóa tài khoản → về khách.
await pill.click();
await dialog.getByRole("tab", { name: "Tài khoản" }).click();
await dialog.getByRole("button", { name: "Xóa tài khoản" }).click();
await dialog.getByRole("button", { name: "Xóa tài khoản" }).first().click();
await toast("Đã xóa tài khoản").waitFor();
await page.waitForFunction(() => /Bạn [0-9a-f]{6}/.test(document.body.innerText));
console.log("xóa tài khoản: ok → khách");

// Tiếng Anh: tên khách "Player …" khi tạo khách mới ở /en.
await page.context().clearCookies();
await page.evaluate(() => localStorage.clear());
await page.goto(base + "/en", { waitUntil: "networkidle" });
await page.waitForFunction(() => /Player [0-9a-f]{6}/.test(document.body.innerText), null, {
  timeout: 15000,
});
console.log("khách tiếng Anh: ok");

for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
