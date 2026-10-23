// Smoke tab Thông số admin (docs/06 — Thông số chỉnh ở admin): mỗi thông số hiện giá trị hiện tại +
// mặc định, ô nhập chữ mực (không tàng hình), Lưu chỉ gửi khóa đã đổi → /site phản ánh → tắt chat →
// khung chat báo tạm đóng → trả về như cũ.
// Cần web (3000) + api (8000) local.   node scripts/smoke-config.mjs [http://localhost:3000]
import { chromium } from "playwright";
import { ADMIN_EMAIL } from "./lib/shop-fixtures.mjs";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
const problems = [];

async function adminToken() {
  const r = await fetch(`${apiBase}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  return (await r.json()).accessToken;
}
async function putConfig(body) {
  const r = await fetch(`${apiBase}/admin/config`, {
    method: "PUT",
    headers: { authorization: `Bearer ${await adminToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`config → ${r.status}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 1100, height: 900 } });
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

async function openConfig() {
  await page.goto(base + "/admin", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Thông số" }).click();
  await page.getByTestId("cfg-mm_accept_seconds").waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
}

try {
  await putConfig({ mm_accept_seconds: 20, chat_enabled: true });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.evaluate(
    async ({ apiBase, email }) => {
      await fetch(`${apiBase}/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    },
    { apiBase, email: ADMIN_EMAIL },
  );
  await openConfig();
  for (const g of ["ranked", "chat", "ads", "account"])
    if (!(await page.getByTestId(`cfg-group-${g}`).count())) problems.push(`thiếu nhóm ${g}`);
  // Chữ trong ô nhập và chữ gợi ý phải là màu mực (trước đây gợi ý màu kem → tàng hình).
  const colors = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="cfg-mm_bot_after_seconds"]');
    return [getComputedStyle(el).color, getComputedStyle(el, "::placeholder").color];
  });
  if (!colors.every((c) => c === "rgb(26, 40, 38)")) problems.push(`màu ô nhập: ${colors}`);
  // Dòng "Hiện tại" của hạn chấp nhận = 20.
  if ((await page.getByTestId("cfg-current-mm_accept_seconds").innerText()) !== "20")
    problems.push("không thấy 'Hiện tại: 20'");
  await page.screenshot({ path: ".shots/admin-config.png", fullPage: true });

  // Đổi hạn chấp nhận 20 → 25 (gõ phím như người dùng), nút Lưu đếm (1), lưu, tải lại.
  const inp = page.getByTestId("cfg-mm_accept_seconds");
  await inp.selectText();
  await inp.pressSequentially("25");
  if ((await inp.inputValue()) !== "25")
    problems.push(`gõ 25 mà ô thành ${await inp.inputValue()}`);
  const save = page.getByTestId("cfg-save");
  if (!/\(1\)/.test(await save.innerText())) problems.push("nút Lưu không đếm 1 thay đổi");
  // Ngoài khoảng (hạn chấp nhận 5–60) → Lưu bị khóa, có dòng báo.
  await inp.selectText();
  await inp.pressSequentially("99");
  if (!(await save.isDisabled())) problems.push("ngoài khoảng mà Lưu vẫn bật");
  await inp.selectText();
  await inp.pressSequentially("25");
  await save.click();
  await page.getByText("Đã lưu").first().waitFor({ timeout: 10000 });
  await openConfig();
  if ((await page.getByTestId("cfg-current-mm_accept_seconds").innerText()) !== "25")
    problems.push("tải lại không thấy Hiện tại: 25");
  console.log("đổi thông số, Lưu chỉ gửi khóa đã đổi, tải lại thấy giá trị mới: ok");

  // Tắt chat từ admin → /site chatEnabled=false → khung chat báo tạm đóng.
  await page.getByTestId("cfg-chat_enabled").click();
  await page.getByTestId("cfg-save").click();
  await page.getByText("Đã lưu").first().waitFor({ timeout: 10000 });
  const site = await (await fetch(`${apiBase}/site`)).json();
  if (site.chatEnabled !== false) problems.push("/site vẫn chatEnabled=true");
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByTestId("chat-bubble").click();
  await page.getByTestId("chat-disabled").waitFor({ timeout: 10000 });
  console.log("tắt chat từ admin: khung chat báo tạm đóng");
} finally {
  await putConfig({ mm_accept_seconds: 20, chat_enabled: true });
  await browser.close();
}
for (const p of problems) console.log("  LỖI: " + p);
process.exit(problems.length === 0 ? 0 : 1);
