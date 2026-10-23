// Smoke chat tổng (docs/15): khách thấy bong bóng, mở chat chỉ đọc (khung khóa) → hai tài khoản
// chat qua lại trực tiếp (WS), trả lời trích dẫn, gửi quá nhanh bị chặn → khách tải lại thấy số tin
// chưa đọc → màn chơi không có bong bóng.
// Cần web (3000) + api (8000) local.   node scripts/smoke-chat.mjs [http://localhost:3000]
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const apiBase = base.replace(/:\d+$/, ":8000");
const stamp = Date.now();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];

async function page(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
  return p;
}
async function login(p, email, displayName) {
  await p.goto(base + "/", { waitUntil: "networkidle" });
  const st = await p.evaluate(
    async ({ apiBase, email, displayName }) => {
      const r = await fetch(`${apiBase}/auth/dev-login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      return r.status;
    },
    { apiBase, email, displayName },
  );
  if (st !== 200) throw new Error(`dev-login ${email} → ${st}`);
  await p.reload({ waitUntil: "networkidle" });
}
async function openChat(p) {
  await p.getByTestId("chat-bubble").click();
  await p.getByTestId("chat-panel").waitFor({ timeout: 10000 });
}
async function sendMsg(p, text) {
  await p.getByTestId("chat-input").fill(text);
  await p.keyboard.press("Enter");
}

try {
  // Khách: bong bóng, khung khóa.
  const guest = await page();
  await guest.goto(base + "/", { waitUntil: "networkidle" });
  await guest.getByTestId("chat-bubble").waitFor({ timeout: 15000 });
  await openChat(guest);
  await guest.getByTestId("chat-locked").waitFor({ timeout: 5000 });
  console.log("khách: thấy bong bóng, chat chỉ đọc");
  await guest.getByTestId("chat-close").click();

  // Hai tài khoản chat qua lại.
  const a = await page();
  const b = await page({ width: 390, height: 844 });
  await login(a, `chat-a-${stamp}@example.com`, "Ánh Chat");
  await login(b, `chat-b-${stamp}@example.com`, "Bảo Chat");
  await openChat(a);
  await openChat(b);
  await a.getByTestId("chat-input").waitFor();
  await b.getByTestId("chat-input").waitFor();
  await a.waitForTimeout(500);
  const hello = `Chào cả nhà ${stamp}`;
  await sendMsg(a, hello);
  await b.getByTestId("chat-body").filter({ hasText: hello }).waitFor({ timeout: 10000 });
  console.log("B nhận tin của A trực tiếp");
  if ((await a.getByTestId("chat-input").inputValue()) !== "") problems.push("ô nhập chưa xóa");

  // B trả lời A.
  const row = b.getByTestId("chat-row").filter({ hasText: hello }).last();
  await row.hover();
  await row.getByTestId("chat-reply").click();
  await b.getByTestId("chat-replying").waitFor();
  await sendMsg(b, "chào Ánh nha");
  await a.getByTestId("chat-body").filter({ hasText: "chào Ánh nha" }).waitFor({ timeout: 10000 });
  const replyRow = a.getByTestId("chat-row").filter({ hasText: "chào Ánh nha" }).last();
  if (!(await replyRow.innerText()).includes(hello)) problems.push("thiếu trích dẫn tin trả lời");
  console.log("trả lời trích dẫn ok");
  await b.screenshot({ path: ".shots/chat-mobile.png" });

  // Gửi quá nhanh → toast lỗi, tin không lên.
  await a.waitForTimeout(2100);
  await sendMsg(a, "nhanh 1");
  await a.getByTestId("chat-body").filter({ hasText: "nhanh 1" }).waitFor({ timeout: 5000 });
  await sendMsg(a, "nhanh 2");
  await a.getByText(/Thao tác quá nhanh/).waitFor({ timeout: 5000 });
  if ((await a.getByTestId("chat-input").inputValue()) !== "nhanh 2")
    problems.push("tin bị chặn mà ô nhập bị xóa");
  console.log("gửi quá nhanh: báo lỗi, giữ nội dung");
  await a.screenshot({ path: ".shots/chat-pc.png" });

  // Khách tải lại → số tin chưa đọc.
  await guest.reload({ waitUntil: "networkidle" });
  await guest.getByTestId("chat-unread").waitFor({ timeout: 10000 });
  console.log("khách: tin chưa đọc =", await guest.getByTestId("chat-unread").innerText());
  await openChat(guest);
  await guest.getByTestId("chat-body").filter({ hasText: hello }).waitFor({ timeout: 10000 });
  if (await guest.getByTestId("chat-unread").count())
    problems.push("mở chat mà vẫn còn số chưa đọc");

  // Màn chơi: không có bong bóng.
  await guest.goto(base + "/play", { waitUntil: "networkidle" });
  await guest.waitForTimeout(800);
  if (await guest.getByTestId("chat-bubble").count()) problems.push("có bong bóng ở màn chơi");
  console.log("màn chơi: không có bong bóng");
} finally {
  await browser.close();
}
for (const p of problems) console.log("  " + p);
process.exit(problems.length === 0 ? 0 : 1);
