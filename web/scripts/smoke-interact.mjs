// Smoke tương tác trong trận (docs/08 — Đồ ném): A và B vào phòng riêng → A ném giấy vo (mặc định)
// → B thấy món bay + hiệu ứng trúng ở chip mình; B gửi biểu cảm → A thấy bong bóng; bấm liên tiếp
// bị khoá 2 giây; Shop có tab Đồ ném: thử (hộp thử ném), mua Cà chua → vào trận có thêm nút; chơi với
// máy: ném → máy đáp lại biểu cảm.
// Cần web (3000) + api (8000) local.   node scripts/smoke-interact.mjs [http://localhost:3000]
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
const stamp = Date.now();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];

async function page(viewport = { width: 1000, height: 900 }) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
  return p;
}
async function login(p, email, displayName, wallet) {
  await p.goto(base + "/", { waitUntil: "networkidle" });
  const st = await p.evaluate(
    async ({ apiBase, email, displayName, wallet }) => {
      const r = await fetch(`${apiBase}/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, ...(wallet ?? {}) }),
      });
      return r.status;
    },
    { apiBase, email, displayName, wallet },
  );
  if (st !== 200) throw new Error(`dev-login ${email} → ${st}`);
  await p.reload({ waitUntil: "networkidle" });
}

try {
  // ----- Phòng riêng: A tạo, B vào -----
  const A = await page();
  const B = await page({ width: 390, height: 844 });
  await login(A, `throw-a-${stamp}@example.com`, "Ánh Ném", { lead: 700, flower: 5 });
  await login(B, `throw-b-${stamp}@example.com`, "Bảo Ném");
  await A.goto(base + "/room", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "Tạo phòng mới" }).click();
  await A.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 15000 });
  const code = A.url().split("/").pop();
  await B.goto(base + `/r/${code}`, { waitUntil: "networkidle" });
  await A.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  await B.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  await A.getByTestId("interaction-bar").waitFor();
  await B.getByTestId("interaction-bar").waitFor();
  console.log(`phòng ${code}: thanh tương tác hiện ở cả hai`);

  // A ném giấy vo → cả hai thấy món bay rồi hiệu ứng trúng; chip đối thủ của A rung.
  await A.getByTestId("throw-throw_paper").click();
  await B.getByTestId("throw-splat").waitFor({ timeout: 8000 });
  await A.getByTestId("throw-splat").waitFor({ timeout: 8000 });
  if ((await B.getByTestId("throw-splat").getAttribute("data-item")) !== "throw_paper")
    problems.push("hiệu ứng trúng không phải giấy vo");
  await B.screenshot({ path: ".shots/interact-splat-390.png" });
  console.log("A ném giấy vo: B thấy hiệu ứng trúng");
  // Khoá 2 giây: nút ném tắt ngay sau khi bấm.
  if (!(await A.getByTestId("throw-throw_paper").isDisabled()))
    problems.push("sau khi ném nút không bị khoá");
  await A.waitForTimeout(2300);
  if (await A.getByTestId("throw-throw_paper").isDisabled())
    problems.push("hết 2 giây nút vẫn khoá");

  // B gửi biểu cảm → A thấy bong bóng ở chip đối thủ (ghế của B).
  await B.getByTestId("emote-button").click();
  await B.getByTestId("emote-lol").click();
  await A.getByTestId("emote-bubble").waitFor({ timeout: 8000 });
  if ((await A.getByTestId("emote-bubble").getAttribute("data-emote")) !== "lol")
    problems.push("bong bóng biểu cảm sai id");
  await A.screenshot({ path: ".shots/interact-emote.png" });
  console.log("B biểu cảm: A thấy bong bóng");
  // Chưa mua → không có nút cà chua.
  if (await A.getByTestId("throw-throw_tomato").count()) problems.push("chưa mua mà có cà chua");

  // ----- Shop: tab Đồ ném, thử, mua Cà chua -----
  await A.goto(base + "/shop", { waitUntil: "networkidle" });
  await A.getByRole("tab", { name: "Đồ ném" }).click();
  await A.getByTestId("skin-throw_tomato").waitFor({ timeout: 10000 });
  await A.getByTestId("skin-throw_tomato").getByRole("button", { name: "Thử" }).click();
  await A.getByTestId("try-throw").click();
  await A.getByTestId("throw-splat").waitFor({ timeout: 8000 });
  await A.screenshot({ path: ".shots/interact-shop-try.png" });
  await A.keyboard.press("Escape");
  await A.getByTestId("skin-throw_tomato").getByRole("button", { name: "Mua" }).click();
  await A.getByTestId("confirm-buy").click();
  await A.getByText(/Đã mua/).waitFor({ timeout: 10000 });
  await A.getByTestId("skin-throw_tomato").getByText("Sẵn sàng ném").waitFor();
  console.log("shop: thử + mua cà chua ok");

  // Về phòng: có nút cà chua, ném → B thấy toé đỏ.
  await A.goto(base + `/r/${code}`, { waitUntil: "networkidle" });
  await A.getByTestId("throw-throw_tomato").waitFor({ timeout: 15000 });
  await A.getByTestId("throw-throw_tomato").click();
  await B.locator("[data-testid=throw-splat][data-item='throw_tomato']").waitFor({ timeout: 8000 });
  console.log("sau khi mua: ném cà chua ok");

  // ----- Chơi với máy: ném → máy đáp lại biểu cảm -----
  await A.goto(base + "/play", { waitUntil: "networkidle" });
  await A.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  await A.getByTestId("throw-throw_paper").click();
  await A.getByTestId("throw-splat").waitFor({ timeout: 8000 });
  await A.locator("[data-testid=emote-bubble][data-seat]").waitFor({ timeout: 8000 });
  console.log("chơi với máy: ném được, máy đáp lại biểu cảm");
} finally {
  await browser.close();
}
for (const p of problems) console.log("  LỖI: " + p);
process.exit(problems.length === 0 ? 0 : 1);
