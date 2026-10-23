// Smoke quảng cáo (docs/10 — Quảng cáo): admin bật thông số "vùng quảng cáo giả" → khách thấy khung
// "AD here" ở trang chủ / Shop / Bảng xếp hạng → admin tắt quảng cáo cho một người (tab Người chơi)
// → người đó không thấy khung, hồ sơ có Trống Đồng → bật lại → thấy lại → tắt thông số.
// Cần web (3000) + api (8000) local.   node scripts/smoke-ads.mjs [http://localhost:3000]
import { chromium } from "playwright";
import { ADMIN_EMAIL } from "./lib/shop-fixtures.mjs";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
const stamp = Date.now();

async function adminToken() {
  const r = await fetch(`${apiBase}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  return (await r.json()).accessToken;
}
async function setMock(on) {
  const tok = await adminToken();
  const r = await fetch(`${apiBase}/admin/config`, {
    method: "PUT",
    headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({ ads_mock: on }),
  });
  if (!r.ok) throw new Error(`config → ${r.status}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ locale: "vi-VN", viewport: { width: 1000, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
page.on("dialog", (d) => d.accept());

try {
  // Mock tắt: không có khung.
  await setMock(false);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByTestId("player-pill").waitFor({ timeout: 15000 });
  if (await page.getByTestId("ad-mock").count()) problems.push("mock tắt mà vẫn có khung");

  // Mock bật: khách thấy khung ở 3 trang.
  await setMock(true);
  for (const [path, name] of [
    ["/", "home"],
    ["/shop", "shop"],
    ["/leaderboard", "leaderboard"],
  ]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.getByTestId("ad-mock").waitFor({ timeout: 15000 });
    const txt = await page.getByTestId("ad-mock").innerText();
    if (!txt.includes(name)) problems.push(`khung ${path} ghi "${txt}"`);
  }
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByTestId("ad-mock").waitFor();
  await page.screenshot({ path: ".shots/ads-mock-home.png", fullPage: true });
  console.log("mock bật: khách thấy AD here ở trang chủ / shop / bảng xếp hạng");

  // Người dùng thật → admin tắt quảng cáo cho người này → không thấy khung, có Trống Đồng.
  const st = await page.evaluate(
    async ({ apiBase, email }) => {
      const r = await fetch(`${apiBase}/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName: "Người Xem QC" }),
      });
      return r.status;
    },
    { apiBase, email: `ads-${stamp}@example.com` },
  );
  if (st !== 200) throw new Error(`dev-login → ${st}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("ad-mock").waitFor({ timeout: 15000 });

  const tok = await adminToken();
  const list = await (
    await fetch(`${apiBase}/admin/users?q=ads-${stamp}`, {
      headers: { authorization: `Bearer ${tok}` },
    })
  ).json();
  const uid = list.items[0].id;
  const r1 = await fetch(`${apiBase}/admin/users/${uid}/ads`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({ adFree: true }),
  });
  if (!(await r1.json()).adFree) problems.push("tắt quảng cáo theo người không ăn");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("player-pill").waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  if (await page.getByTestId("ad-mock").count()) problems.push("đã tắt QC mà vẫn thấy khung");
  await page.getByTestId("player-pill").click();
  await page.getByTestId("donor-badge").waitFor({ timeout: 10000 });
  await page.keyboard.press("Escape");
  console.log("tắt quảng cáo theo người: không thấy khung, có Trống Đồng");

  // Admin UI: tab Người chơi hiện nhãn "Không quảng cáo", nút bật lại.
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
  await page.getByRole("tab", { name: "Người chơi" }).click();
  await page.getByPlaceholder("Tên, email hoặc id").fill(`ads-${stamp}`);
  await page.getByRole("button", { name: "Tìm" }).click();
  const row = page.getByTestId("admin-users").getByText(`ads-${stamp}@example.com`).first();
  await row.waitFor({ timeout: 10000 });
  await page.getByTestId("user-adfree").first().waitFor();
  await row.click();
  await page.getByTestId("admin-user-detail").waitFor();
  await page.screenshot({ path: ".shots/ads-admin-user.png" });
  await page.getByTestId("user-ads-toggle").click();
  await page.getByText("Đã bật lại quảng cáo.").waitFor({ timeout: 10000 });
  console.log("admin: nhãn Không quảng cáo, bật lại ok");

  // Tab Thông số: công tắc vùng giả.
  await page.getByRole("tab", { name: "Thông số" }).click();
  await page.getByTestId("cfg-ads-mock").waitFor({ timeout: 10000 });
  if (!/Đang bật/.test(await page.getByTestId("cfg-ads-mock").innerText()))
    problems.push("công tắc mock không phản ánh trạng thái bật");
} finally {
  await setMock(false);
  await browser.close();
}
for (const p of problems) console.log("  " + p);
process.exit(problems.length === 0 ? 0 : 1);
