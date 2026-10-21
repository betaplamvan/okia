// Smoke test "một phiên mỗi tài khoản" (docs/13) trên Edge thật, ba trình duyệt riêng (context):
//   1. Trình duyệt A đăng nhập (dev-login), tab A1 ở /room (có WS), tab A2 ở trang chủ (không WS).
//   2. A2 đăng nhập lại cùng tài khoản → cùng trình duyệt, cookie chung → A1 KHÔNG bị báo.
//   3. Trình duyệt B đăng nhập cùng tài khoản → A1 báo ngay (WS 4409), A2 báo theo (storage).
//   4. "Chơi tiếp như khách" → đóng hộp, A về khách.
//   5. Trình duyệt C đăng nhập → B (trang chủ, không WS) báo khi quay lại tab; C vẫn là tài khoản.
// Cần web (3000) + api (8000).
//
//   node scripts/smoke-session.mjs http://localhost:3000
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const email = `smoke-session-${Date.now()}@example.com`;
const NAME = "Phiên Thử";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const opts = { locale: "vi-VN", viewport: { width: 390, height: 844 } };
const ctxA = await browser.newContext(opts);
const ctxB = await browser.newContext(opts);

const problems = [];
function watch(page, label) {
  page.on("console", (m) => {
    // 401 (refresh chưa có cookie / phiên bị thay) là cố ý → bỏ qua.
    if (m.type() === "error" && !/status of 401/.test(m.text()))
      problems.push(`[${label} console.error] ${m.text().split("\n")[0].slice(0, 200)}`);
  });
  page.on("pageerror", (e) =>
    problems.push(`[${label} pageerror] ${String(e.message).slice(0, 200)}`),
  );
  return page;
}

async function devLogin(page) {
  const status = await page.evaluate(
    async ({ email, name }) => {
      const r = await fetch(`${location.protocol}//${location.hostname}:8000/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName: name }),
      });
      return r.status;
    },
    { email, name: NAME },
  );
  if (status !== 200) throw new Error(`dev-login → ${status}`);
}

const replaced = (page) => page.getByTestId("session-replaced-dialog");

/** Tên đang đăng nhập: pill ở trang chủ; trang khác chỉ có avatar → mở hộp hồ sơ đọc rồi đóng. */
async function shownName(page) {
  const pill = page.getByTestId("player-pill");
  if (await pill.count()) return (await pill.innerText()).trim();
  await page.bringToFront(); // tab nền không nhận phím Escape
  await page.getByTestId("user-button").click();
  const d = page.getByRole("dialog").first();
  await d.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(500);
  const text = await d.innerText();
  await page.keyboard.press("Escape");
  await d.waitFor({ state: "hidden", timeout: 5000 });
  return text;
}

async function expectName(page, label, re) {
  const until = Date.now() + 15000;
  let last = "";
  while (Date.now() < until) {
    last = await shownName(page);
    if (re.test(last)) {
      console.log(`${label}: ${last.match(re)[0]}`);
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`${label}: không thấy ${re} (đang thấy: ${last.slice(0, 120)})`);
}

// 1. A đăng nhập; A1 ở /room (WS), A2 ở trang chủ.
const a1 = watch(await ctxA.newPage(), "A1");
await a1.goto(base + "/", { waitUntil: "networkidle" });
await devLogin(a1);
await a1.goto(base + "/room", { waitUntil: "networkidle" });
await expectName(a1, "A1", new RegExp(NAME));
const a2 = watch(await ctxA.newPage(), "A2");
await a2.goto(base + "/", { waitUntil: "networkidle" });
await expectName(a2, "A2", new RegExp(NAME));

// 2. Đăng nhập lại trong cùng trình duyệt → A1 bị đá WS nhưng refresh bằng cookie mới, không báo.
await devLogin(a2);
await a1.waitForTimeout(3000);
if (await replaced(a1).isVisible()) problems.push("A1 bị báo dù đăng nhập lại cùng trình duyệt");
await expectName(a1, "A1 sau đăng nhập lại cùng trình duyệt", new RegExp(NAME));

// 3. B đăng nhập cùng tài khoản → A1 báo ngay (WS 4409), A2 cùng trình duyệt báo theo (storage).
const b = watch(await ctxB.newPage(), "B");
await b.goto(base + "/", { waitUntil: "networkidle" });
await devLogin(b);
await b.reload({ waitUntil: "networkidle" });
await expectName(b, "B", new RegExp(NAME));
await replaced(a1).waitFor({ state: "visible", timeout: 5000 });
console.log("A1: hiện thông báo đăng nhập nơi khác (WS) ✓");
await replaced(a2).waitFor({ state: "visible", timeout: 5000 });
console.log("A2: hiện thông báo theo tab cùng trình duyệt ✓");

// 4. Chơi tiếp như khách → A về khách.
await replaced(a1).getByRole("button", { name: "Chơi tiếp như khách" }).click();
await replaced(a1).waitFor({ state: "hidden", timeout: 5000 });
await expectName(a1, "A1 sau khi đóng hộp", /Bạn [0-9a-f]{6}/);

// 5. C đăng nhập (B chỉ ở trang chủ, không WS) → B báo khi quay lại tab (cách lần trước ≥ 10 s).
const ctxC = await browser.newContext(opts);
const c = watch(await ctxC.newPage(), "C");
await c.goto(base + "/", { waitUntil: "networkidle" });
await devLogin(c);
await c.reload({ waitUntil: "networkidle" });
await expectName(c, "C", new RegExp(NAME));
await b.waitForTimeout(10_500);
if (await replaced(b).isVisible()) problems.push("B báo trước khi quay lại tab (không mong đợi)");
await b.evaluate(() => window.dispatchEvent(new Event("focus")));
await replaced(b).waitFor({ state: "visible", timeout: 5000 });
console.log("B: hiện thông báo khi quay lại tab ✓");
await c.reload({ waitUntil: "networkidle" });
await expectName(c, "C vẫn đăng nhập", new RegExp(NAME));
if (await replaced(c).isVisible()) problems.push("C bị báo nhầm");

await browser.close();
if (problems.length) {
  console.log("\nVấn đề:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nOK");
