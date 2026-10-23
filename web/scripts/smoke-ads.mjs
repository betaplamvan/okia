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
  if (await page.locator("[data-testid=ad-mock]:visible").count())
    problems.push("mock tắt mà vẫn có khung");

  // Mock bật: khách thấy khung ở 3 trang.
  await setMock(true);
  for (const [path, name] of [
    ["/", "home"],
    ["/shop", "shop"],
    ["/leaderboard", "leaderboard"],
  ]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.locator("[data-testid=ad-mock]:visible").first().waitFor({ timeout: 15000 });
    const txt = await page.locator("[data-testid=ad-mock]:visible").first().innerText();
    if (!txt.includes(name)) problems.push(`khung ${path} ghi "${txt}"`);
  }
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.locator("[data-testid=ad-mock]:visible").first().waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("ad-rail-left").waitFor({ timeout: 5000 });
  await page.getByTestId("ad-rail-right").waitFor();
  await page.screenshot({ path: ".shots/ads-mock-home.png", fullPage: true });
  await page.goto(base + "/play", { waitUntil: "networkidle" });
  if (await page.getByTestId("ad-rail-left").count()) problems.push("có cột quảng cáo ở màn chơi");
  await page.setViewportSize({ width: 1000, height: 900 });
  // Quảng cáo xen: bộ đếm = 2 ván → chơi hết một ván 5×5 → "Chơi lại" (ván thứ 3) → lớp phủ.
  // "Ván mới" khi ván CHƯA kết thúc thì không có quảng cáo.
  await page.evaluate(() => localStorage.setItem("okia-ad-games", "2"));
  await page.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Ván mới" }).click();
  await page.waitForTimeout(400);
  if (await page.getByTestId("ad-interstitial").count()) problems.push("xen QC khi ván chưa xong");
  await page.getByRole("button", { name: "Đổi bàn" }).click();
  await page.getByRole("radio", { name: "5×5" }).click();
  await page.getByRole("button", { name: "Chơi bàn này" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForTimeout(300);
  const N = 5;
  const box = await page.getByRole("application").locator("canvas").boundingBox();
  const size = Math.min(box.width, box.height);
  const pad = size * 0.02;
  const cell = (size - pad * 2) / (N + 1.3);
  const offX = box.x + (box.width - N * cell) / 2;
  const offY = box.y + (box.height - N * cell) / 2;
  const edges = [];
  for (let r = 0; r <= N; r++)
    for (let c = 0; c < N; c++) edges.push({ x: offX + (c + 0.5) * cell, y: offY + r * cell });
  for (let r = 0; r < N; r++)
    for (let c = 0; c <= N; c++) edges.push({ x: offX + c * cell, y: offY + (r + 0.5) * cell });
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 300; i++) {
    if (await dialog.isVisible()) break;
    const text = (await page.getByRole("status").first().innerText()).trim();
    if (!text.includes("Đến lượt bạn")) {
      await page.waitForTimeout(100);
      continue;
    }
    const e = edges[i % edges.length];
    await page.mouse.click(e.x, e.y);
    await page.waitForTimeout(100);
  }
  await dialog.getByRole("button", { name: "Chơi lại" }).click({ timeout: 20000 });
  await page.getByTestId("ad-interstitial").waitFor({ timeout: 5000 });
  await page.screenshot({ path: ".shots/ads-interstitial.png" });
  await page.getByTestId("ad-interstitial-close").click({ timeout: 8000 });
  await page.getByTestId("ad-interstitial").waitFor({ state: "hidden" });
  console.log("quảng cáo xen: không khi ván chưa xong; có ở lần Chơi lại thứ 3, bỏ qua sau 5 giây");
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
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.locator("[data-testid=ad-mock]:visible").first().waitFor({ timeout: 15000 });

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
  if (await page.locator("[data-testid=ad-mock]:visible").count())
    problems.push("đã tắt QC mà vẫn thấy khung");
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
