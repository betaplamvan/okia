// Smoke test cửa hàng skin (ADR-0013) trên Edge thật:
// khách mở /shop → thấy thẻ skin, nút Mua bị khóa, Thử mở bàn mẫu và vẽ được → dev-login có sẵn
// 700 Ruột chì + 5 Hoa → mua Bút dạ (250) → ví còn 450 → Trang bị → thẻ "Đang dùng" → mua Bút vàng
// bằng Hoa → ví Hoa 0 → mua Bút neon (1500) báo không đủ → vào /play thấy bàn (skin áp cho ghế mình).
// Cần web (3000) và api (8000, ngoài production) đang chạy.
//
//   node scripts/smoke-shop.mjs http://localhost:3000
import { chromium } from "playwright";
import { ensureShopSkins } from "./lib/shop-fixtures.mjs";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const stamp = Date.now().toString(36);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 40[19]|during prerendering/.test(m.text()))
    problems.push(`[console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));

// Seed chỉ còn skin default → nhập 6 skin fixture qua API admin trước (shared/fixtures/skins/test-skins.json).
await ensureShopSkins(base.replace(/:\d+$/, ":8000"));

// Khách.
await page.goto(base + "/shop", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Cửa hàng" }).waitFor();
await page.getByTestId("skin-pen_marker").waitFor({ timeout: 15000 });
const guestBuy = page.getByTestId("skin-pen_marker").getByRole("button", { name: "Mua" });
if (!(await guestBuy.isDisabled())) problems.push("khách vẫn bấm Mua được");
await page.getByText("Đăng nhập Google để mua").waitFor();
await page.screenshot({ path: ".shots/shop-guest-390.png", fullPage: true });
console.log("khách: thấy shop, Mua bị khóa");

// Thử skin: hộp bàn mẫu + vẽ thử 8 nước (có ăn ô).
await page.getByTestId("skin-pen_ink_purple").getByRole("button", { name: "Thử" }).click();
const dlg = page.getByRole("dialog");
await dlg.getByRole("application").locator("canvas").waitFor({ timeout: 15000 });
for (let i = 0; i < 8; i++) {
  await dlg.getByTestId("try-draw").click();
  await page.waitForTimeout(250);
}
await page.screenshot({ path: ".shots/shop-try-390.png" });
await dlg.getByRole("button", { name: "Vẽ lại" }).click();
await page.keyboard.press("Escape");
await dlg.waitFor({ state: "hidden" });
console.log("thử skin: ok");

// Đăng nhập dev có tiền.
const status = await page.evaluate(async (email) => {
  const apiBase = `${location.protocol}//${location.hostname}:8000`;
  const headers = { "content-type": "application/json" };
  const r0 = await fetch(`${apiBase}/auth/refresh`, { method: "POST", credentials: "include" });
  if (r0.ok) headers.authorization = `Bearer ${(await r0.json()).accessToken}`;
  const r = await fetch(`${apiBase}/auth/dev-login`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ email, lead: 700, flower: 5 }),
  });
  return r.status;
}, `shop-${stamp}@example.com`);
if (status !== 200) throw new Error(`dev-login → ${status}`);
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("skin-pen_marker").waitFor({ timeout: 15000 });
await page.getByText("700").first().waitFor();

// Mua Bút dạ 250 → xác nhận → ví 450, thẻ có nút Trang bị.
const marker = page.getByTestId("skin-pen_marker");
await marker.getByRole("button", { name: "Mua" }).click();
await page.getByTestId("confirm-buy").click();
await page.getByText("Đã mua Bút dạ!").waitFor({ timeout: 10000 });
await page.getByText("450").first().waitFor();
await marker.getByRole("button", { name: "Trang bị" }).click();
await page.getByText("Đã trang bị Bút dạ.").waitFor();
await marker.getByRole("button", { name: "Đang dùng" }).waitFor();
console.log("mua + trang bị Bút dạ: ok (ví 450)");

// Bút vàng tốn 5 Hoa → Hoa về 0; Bút neon 1500 → không đủ.
const gold = page.getByTestId("skin-pen_gold");
await gold.getByRole("button", { name: "Mua" }).click();
await page.getByTestId("confirm-buy").click();
await page.getByText("Đã mua Bút vàng!").waitFor({ timeout: 10000 });
await gold.getByRole("button", { name: "Trang bị" }).waitFor();
const neon = page.getByTestId("skin-pen_neon");
await neon.getByRole("button", { name: "Mua" }).click();
await page.getByTestId("confirm-buy").click();
await page.getByText("Không đủ tiền").waitFor({ timeout: 10000 });
await page.keyboard.press("Escape");
await page.screenshot({ path: ".shots/shop-owned-390.png", fullPage: true });
console.log("bút vàng bằng Hoa: ok; neon không đủ tiền: ok");

// Tab Ô: mua Tô kín (100) → ví 350.
await page.getByRole("tab", { name: "Ô đã ăn" }).click();
const fill = page.getByTestId("skin-box_fill");
await fill.getByRole("button", { name: "Mua" }).click();
await page.getByTestId("confirm-buy").click();
await page.getByText("Đã mua Tô kín!").waitFor({ timeout: 10000 });
await fill.getByRole("button", { name: "Trang bị" }).click();
await fill.getByRole("button", { name: "Đang dùng" }).waitFor();
await page.getByText("350").first().waitFor();
console.log("mua + trang bị Tô kín: ok (ví 350)");

// /play: bàn hiện (skin áp vào ghế của mình không lỗi).
await page.goto(base + "/play", { waitUntil: "networkidle" });
await page.getByRole("application").locator("canvas").waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: ".shots/shop-play-390.png" });
console.log("/play với skin: ok");

for (const p of problems) console.log("  LỖI: " + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
