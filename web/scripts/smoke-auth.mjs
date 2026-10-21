// Smoke test xác thực (ADR-0011: chỉ khách + Google) trên Edge thật: vào trang chủ → tự có khách →
// mở hồ sơ, tab Tài khoản chỉ có nút Google → "đăng nhập" bằng /auth/dev-login (API chỉ mở ngoài
// production, đi đúng luồng nâng cấp khách như Google) → đổi tên → đăng xuất (về khách mới) →
// đăng nhập lại (chuyển sang tài khoản cũ) → xóa tài khoản. Cần web (3000) + api (8000).
//
//   node scripts/smoke-auth.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const email = `smoke-${Date.now()}@example.com`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 390, height: 844 } });

const problems = [];
page.on("console", (m) => {
  // 401 từ /auth/refresh (chưa có cookie) là cố ý → bỏ qua.
  if (m.type() === "error" && !/status of 401/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

const pill = page.getByTestId("player-pill");
const dialog = page.getByRole("dialog");
const toast = (text) => page.getByText(text, { exact: false }).first();

/** Đăng nhập dev-login trong ngữ cảnh trang (cookie refresh được đặt), kèm Bearer của khách nếu có
 *  để nâng cấp đúng tài khoản khách đang dùng; sau đó tải lại trang để store boot lại từ cookie. */
async function devLogin(withGuestToken) {
  const status = await page.evaluate(
    async ({ email, withGuestToken }) => {
      const apiBase = `${location.protocol}//${location.hostname}:8000`;
      const headers = { "content-type": "application/json" };
      if (withGuestToken) {
        // Store không expose token; lấy access token mới từ cookie refresh.
        const r = await fetch(`${apiBase}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (r.ok) headers.authorization = `Bearer ${(await r.json()).accessToken}`;
      }
      const r = await fetch(`${apiBase}/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ email }),
      });
      return r.status;
    },
    { email, withGuestToken },
  );
  if (status !== 200) throw new Error(`dev-login → ${status}`);
  await page.reload({ waitUntil: "networkidle" });
}

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => /Bạn [0-9a-f]{6}/.test(document.body.innerText), null, {
  timeout: 15000,
});
const guestName = (await pill.innerText()).match(/Bạn [0-9a-f]{6}/)?.[0];
console.log(`khách: ${guestName}`);

// Tab Tài khoản của khách: chỉ có Google, không còn form email/mật khẩu.
await pill.click();
await dialog.waitFor();
await dialog.getByRole("tab", { name: "Tài khoản" }).click();
await dialog.getByRole("button", { name: /Tiếp tục với Google/ }).waitFor();
if ((await dialog.getByLabel("Mật khẩu").count()) !== 0) problems.push("còn ô Mật khẩu");
if ((await dialog.getByRole("button", { name: /Dùng email/ }).count()) !== 0)
  problems.push("còn nút Dùng email");
await page.screenshot({ path: ".shots/auth-guest-390.png" });
console.log("khách: tab Tài khoản chỉ có Google");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" });

// Nâng cấp khách (giữ nguyên tên khách vì dev-login không có tên Google).
await devLogin(true);
await page.getByText(guestName).first().waitFor({ timeout: 10000 });
await pill.click();
await dialog.getByRole("tab", { name: "Tài khoản" }).click();
await dialog.getByText(email).waitFor();
await dialog.getByText("Tài khoản Google").waitFor();
await page.screenshot({ path: ".shots/auth-account-390.png" });
console.log("nâng cấp khách: ok (email hiện trong tab Tài khoản, huy hiệu Tài khoản Google)");

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

// Đăng nhập lại cùng email (khách mới → chuyển sang tài khoản đã có, tên Tí Sún).
await devLogin(true);
await page.getByText("Tí Sún").first().waitFor({ timeout: 10000 });
console.log("đăng nhập lại: ok (chuyển sang tài khoản cũ)");

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
