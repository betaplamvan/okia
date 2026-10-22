// Smoke trang ủng hộ (docs/10 — Donate): khách mở /donate → có mã VietQR, nội dung "OKIA <tên>"
// đổi theo ô tên → bắn webhook SePay giả (key local) → tải lại thấy tên trên bảng cảm ơn → người đã
// đăng nhập thấy mã tài khoản trong nội dung, webhook với mã → tên tài khoản + "bạn" → admin tab
// Ủng hộ thấy số tiền, ẩn một dòng → biến khỏi bảng.
// Cần web (3000) + api (8000) với SEPAY_API_KEY=local-sepay, DONATE_BANK_BIN/ACCOUNT_NO đặt.
//   node scripts/smoke-donate.mjs [http://localhost:3000]
import { chromium } from "playwright";
import { ADMIN_EMAIL } from "./lib/shop-fixtures.mjs";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
const stamp = Date.now();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 1000, height: 900 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 40[13]/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

async function sepay(id, content, amount = 20000, kind = "in") {
  const r = await fetch(`${apiBase}/donate/webhook/sepay`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Apikey local-sepay" },
    body: JSON.stringify({
      id,
      gateway: "MBBank",
      transactionDate: "2026-10-23 10:15:00",
      accountNumber: "0123456789",
      content,
      transferType: kind,
      transferAmount: amount,
      referenceCode: `FT${id}`,
      description: content,
    }),
  });
  if (!r.ok) throw new Error(`webhook → ${r.status} ${await r.text()}`);
  return r.json();
}

// Khách: không có QR, hộp bắt buộc liên kết Google; vẫn thấy mốc, quà, bảng.
await page.goto(base + "/donate", { waitUntil: "networkidle" });
await page.getByTestId("donate-link-required").waitFor({ timeout: 15000 });
await page.getByTestId("donate-gift").waitFor();
if (await page.getByTestId("donate-qr").isVisible()) problems.push("khách vẫn thấy QR");
await page.screenshot({ path: ".shots/donate-guest.png", fullPage: true });
console.log("khách: bắt buộc liên kết, không QR");

// Đăng nhập (tài khoản liên kết) → QR + nội dung OKIA <mã> → đổi mốc / nhập số khác.
const status = await page.evaluate(
  async ({ apiBase, email }) => {
    const r = await fetch(`${apiBase}/auth/dev-login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, displayName: "Người Ủng Hộ" }),
    });
    return r.status;
  },
  { apiBase, email: `donor-${stamp}@example.com` },
);
if (status !== 200) throw new Error(`dev-login → ${status}`);
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("donate-qr").waitFor({ timeout: 15000 });
const myNote = (await page.getByTestId("donate-note").innerText()).trim();
const code = myNote.replace("OKIA ", "");
if (!/^[0-9A-F]{6}$/.test(code)) problems.push("nội dung không có mã: " + myNote);
await page.getByTestId("tier-100000").click();
await page.getByText("100.000đ").nth(1).waitFor();
await page.getByTestId("donate-custom").fill("5000");
await page.getByText("Tối thiểu 10.000đ.").waitFor();
if (await page.getByTestId("donate-qr").isVisible()) problems.push("số quá nhỏ vẫn có QR");
await page.getByTestId("donate-custom").fill("35000");
await page.getByTestId("donate-qr").waitFor({ timeout: 5000 });
await page.screenshot({ path: ".shots/donate-user.png", fullPage: true });
console.log("đã liên kết: QR + nội dung", myNote, "; mốc / số khác ok");

// Webhook với mã → mạnh thường quân (avatar + tên tài khoản, "bạn"), Trống Đồng trong hồ sơ.
await sepay(stamp, `MBVCB.1.OKIA ${code}.CT tu 0123`, 35000);
await sepay(stamp + 1, "chuyen tien", 5000, "out"); // bỏ qua
await sepay(stamp + 2, "OKIA Khong Ma", 20000); // tên tự do: ghi nhưng không lên bảng
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("donate-thanks").getByText("Người Ủng Hộ · bạn").waitFor({ timeout: 10000 });
const mineRow = page
  .getByTestId("donate-thanks")
  .locator('[data-testid^="supporter-"]', { hasText: "· bạn" });
const donorId = (await mineRow.getAttribute("data-testid")).replace("supporter-", "");
if (await page.getByTestId("donate-thanks").getByText("Khong Ma").isVisible())
  problems.push("tên tự do lên bảng");
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.getByTestId("player-pill").click();
await page.getByTestId("donor-badge").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/donate-profile.png" });
await page.keyboard.press("Escape");
console.log("webhook với mã: lên bảng + Trống Đồng trong hồ sơ");

// Admin: tab Ủng hộ thấy số tiền; ẩn dòng của tài khoản → biến khỏi bảng.
const st2 = await page.evaluate(
  async ({ apiBase, email }) => {
    const r = await fetch(`${apiBase}/auth/dev-login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return r.status;
  },
  { apiBase, email: ADMIN_EMAIL },
);
if (st2 !== 200) throw new Error(`dev-login admin → ${st2}`);
await page.goto(base + "/admin", { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Ủng hộ" }).click();
await page.getByTestId("admin-donations").waitFor({ timeout: 15000 });
await page.getByText("35.000đ").first().waitFor();
const row = page.getByTestId("admin-donations").locator("tr", { hasText: `OKIA ${code}` });
await row.getByRole("button", { name: "Ẩn" }).click();
await page.getByText("Đã lưu.").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/donate-admin.png" });
await page.goto(base + "/donate", { waitUntil: "networkidle" });
await page.getByTestId("donate-thanks").waitFor();
if (await page.getByTestId(`supporter-${donorId}`).count())
  problems.push("đã ẩn mà vẫn hiện trên bảng");
console.log("admin: thấy số tiền, ẩn dòng ok");

for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
