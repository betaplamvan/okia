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

// Khách: QR + nội dung theo tên.
await page.goto(base + "/donate", { waitUntil: "networkidle" });
await page.getByTestId("donate-qr").waitFor({ timeout: 15000 });
await page.getByTestId("donate-name").fill("Bé Na");
await page.getByTestId("donate-note").waitFor();
const note = (await page.getByTestId("donate-note").innerText()).trim();
if (note !== "OKIA Be Na") problems.push("nội dung sai: " + note);
await page.getByRole("button", { name: "100.000đ" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: ".shots/donate-guest.png", fullPage: true });
console.log("khách: QR + nội dung", note);

// Webhook giả → tên lên bảng.
const name = `Na${stamp % 10000}`;
const r1 = await sepay(stamp, `MBVCB.1.OKIA ${name}.CT tu 0123`);
if (!r1.success) problems.push("webhook không success");
await sepay(stamp + 1, "chuyen tien", 5000, "out"); // bỏ qua
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("donate-thanks").getByText(name).waitFor({ timeout: 10000 });
console.log("webhook sepay: tên lên bảng cảm ơn", name);

// Đăng nhập → mã tài khoản trong nội dung → webhook với mã → tên tài khoản + "bạn".
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
// Nội dung đổi sang mã tài khoản sau khi store có token (fetch /donate lần hai) → chờ mẫu mã.
await page.waitForFunction(
  () =>
    /^OKIA [0-9A-F]{6}$/.test(
      document.querySelector('[data-testid="donate-note"]')?.textContent?.trim() ?? "",
    ),
  null,
  { timeout: 15000 },
);
const myNote = (await page.getByTestId("donate-note").innerText()).trim();
const code = myNote.replace("OKIA ", "");
if (!/^[0-9A-F]{6}$/.test(code)) problems.push("không thấy mã tài khoản: " + myNote);
await sepay(stamp + 2, `OKIA ${code}`, 50000);
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("donate-thanks").getByText("Người Ủng Hộ · bạn").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/donate-user.png", fullPage: true });
console.log("mã tài khoản:", code, "→ tên tài khoản + bạn");

// Admin: tab Ủng hộ thấy số tiền; ẩn dòng của Na → biến khỏi bảng.
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
await page.getByText("50.000đ").first().waitFor();
const row = page.getByTestId("admin-donations").locator("tr", { hasText: name });
await row.getByRole("button", { name: "Ẩn" }).click();
await page.getByText("Đã lưu.").waitFor({ timeout: 10000 });
await page.screenshot({ path: ".shots/donate-admin.png" });
await page.goto(base + "/donate", { waitUntil: "networkidle" });
await page.getByTestId("donate-thanks").waitFor();
if (await page.getByTestId("donate-thanks").getByText(name).isVisible())
  problems.push("đã ẩn mà vẫn hiện trên bảng");
console.log("admin: thấy số tiền, ẩn dòng ok");

for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
