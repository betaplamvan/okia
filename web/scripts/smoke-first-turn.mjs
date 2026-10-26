// Smoke khởi đầu công bằng (docs/03 — Trạng thái ván): chơi với máy — nhiều ván mới, lượt đầu
// phải có cả "Bạn đi trước" lẫn "Máy đi trước" (ngẫu nhiên), mỗi ván hiện màn thông báo; chip mình
// luôn bên trái màu Xanh, máy bên phải màu Đỏ. Phòng riêng: cả hai thấy màn thông báo đúng phía,
// mỗi bên chip mình trái/xanh, đối thủ phải/đỏ (dù ngồi ghế 0 hay 1).
// Cần web (3000) + api (8000) local.   node scripts/smoke-first-turn.mjs [http://localhost:3000]
import { chromium } from "playwright";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];
const BLUE = "rgb(30, 79, 216)";
const RED = "rgb(216, 52, 30)";

async function page(viewport = { width: 1000, height: 900 }) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`[pageerror] ${String(e.message).slice(0, 200)}`));
  return p;
}

/** Màu nền avatar trong chip ghế `seat` và vị trí trái/phải của chip. */
async function chipInfo(p) {
  return p.evaluate(() => {
    const chips = [...document.querySelectorAll("[data-hud-seat]")];
    return chips.map((c) => {
      const r = c.getBoundingClientRect();
      const dot = c.querySelector("div");
      return {
        seat: c.getAttribute("data-hud-seat"),
        left: r.left,
        bg: dot ? getComputedStyle(dot).backgroundColor : "",
      };
    });
  });
}

async function checkSides(p, mySeat, who) {
  const chips = await chipInfo(p);
  const me = chips.find((c) => c.seat === String(mySeat));
  const opp = chips.find((c) => c.seat !== String(mySeat));
  if (!me || !opp) return problems.push(`${who}: thiếu chip`);
  if (!(me.left < opp.left)) problems.push(`${who}: chip mình không ở bên trái`);
  if (me.bg !== BLUE) problems.push(`${who}: chip mình màu ${me.bg}, kỳ vọng xanh`);
  if (opp.bg !== RED) problems.push(`${who}: chip đối thủ màu ${opp.bg}, kỳ vọng đỏ`);
}

try {
  // ----- Chơi với máy: nhiều ván, lượt đầu ngẫu nhiên -----
  const P = await page();
  await P.goto(base + "/play", { waitUntil: "networkidle" });
  await P.getByRole("application").locator("canvas").waitFor({ timeout: 20000 });
  const seen = { you: 0, bot: 0 };
  for (let i = 0; i < 12; i++) {
    if (i > 0) await P.getByRole("button", { name: "Ván mới" }).click();
    const banner = P.getByTestId("first-turn-banner");
    await banner.waitFor({ timeout: 5000 });
    const mine = (await banner.getAttribute("data-mine")) === "true";
    const text = await banner.innerText();
    if (mine !== text.includes("Bạn đi trước")) problems.push(`ván ${i + 1}: banner sai: ${text}`);
    seen[mine ? "you" : "bot"] += 1;
    const mySeat = await P.evaluate(() =>
      [...document.querySelectorAll("[data-hud-seat]")]
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
        .getAttribute("data-hud-seat"),
    );
    await checkSides(P, Number(mySeat), `chơi với máy ván ${i + 1}`);
    if (i === 0) await P.screenshot({ path: ".shots/first-turn-play.png" });
    await banner.waitFor({ state: "hidden", timeout: 4000 });
  }
  console.log(`chơi với máy 12 ván: bạn đi trước ${seen.you}, máy đi trước ${seen.bot}`);
  if (seen.you === 0 || seen.bot === 0) problems.push("lượt đầu không ngẫu nhiên");

  // ----- Phòng riêng: hai người -----
  const A = await page();
  const B = await page({ width: 390, height: 844 });
  await A.goto(base + "/room", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "Tạo phòng mới" }).click();
  await A.waitForURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 15000 });
  const code = A.url().split("/").pop();
  await B.goto(base + `/r/${code}`, { waitUntil: "networkidle" });
  const [ba, bb] = [A.getByTestId("first-turn-banner"), B.getByTestId("first-turn-banner")];
  await ba.waitFor({ timeout: 15000 });
  await bb.waitFor({ timeout: 15000 });
  const aMine = (await ba.getAttribute("data-mine")) === "true";
  const bMine = (await bb.getAttribute("data-mine")) === "true";
  if (aMine === bMine) problems.push("phòng riêng: cả hai cùng thấy mình đi trước / sau");
  console.log(
    `phòng ${code}: A thấy "${(await ba.innerText()).split("\n")[0]}", B thấy "${(await bb.innerText()).split("\n")[0]}"`,
  );
  await B.screenshot({ path: ".shots/first-turn-room-390.png" });
  for (const [p, who] of [
    [A, "A"],
    [B, "B"],
  ]) {
    const mySeat = await p.evaluate(() =>
      [...document.querySelectorAll("[data-hud-seat]")]
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
        .getAttribute("data-hud-seat"),
    );
    await checkSides(p, Number(mySeat), `phòng riêng ${who}`);
  }
  const seats = await Promise.all(
    [A, B].map((p) =>
      p.evaluate(() =>
        [...document.querySelectorAll("[data-hud-seat]")]
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
          .getAttribute("data-hud-seat"),
      ),
    ),
  );
  if (seats[0] === seats[1]) problems.push("A và B cùng ghế bên trái — ánh xạ ghế sai");
  console.log(`ghế bên trái: A = ${seats[0]}, B = ${seats[1]} (mỗi người thấy mình trái/xanh)`);
} finally {
  await browser.close();
}
for (const p of problems) console.log("  LỖI: " + p);
process.exit(problems.length === 0 ? 0 : 1);
