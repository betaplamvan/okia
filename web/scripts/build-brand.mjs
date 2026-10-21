// Sinh bộ nhận diện Ô Kìa (logo, favicon, icon PWA, ảnh OG, logo email) từ MỘT nguồn trong file này.
// Mark = "một nét" (mẫu K, chốt 2026-10-21): ô bo tròn chỉ có nét viền + dấu mũ là một nét cong,
// một màu, không chấm, không bóng. Chữ "kìa" / "ô kìa" viết thường, Quicksand Bold, chuyển thành
// path bằng fontkit nên SVG không cần font.
//
//   pnpm assets:brand            # ghi public/brand/*, src/app/{icon.svg,favicon.ico,apple-icon.png}
//                                # và src/app/[locale]/opengraph-image.png
//
// Font Quicksand (OFL 1.1) tải một lần vào scripts/.cache/ (gitignore).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "scripts", ".cache");
const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/quicksand/Quicksand%5Bwght%5D.ttf";

const INK = "#1a2826";
const PAPER = "#fffcf2";
const MINT = "#7cf5c5";
const CORAL = "#ff6b6b";
const GREEN = "#35544a";

// ---- Mark (viewBox 0 0 100 100) ---------------------------------------------------------------

/**
 * Mark một nét: ô bo tròn (viền, không tô) + dấu mũ cong. `stroke` = màu nét; `fill` tô trong ô
 * (chỉ dùng ở cỡ nhỏ cho đỡ rỗng); `bold` tăng nét cho 16–32px.
 */
function markBody({ stroke = INK, fill = "none", bold = false } = {}) {
  const w = bold ? 12 : 10;
  return [
    `<rect x="25" y="39" width="50" height="50" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`,
    `<path d="M35 25 Q50 10 65 25" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`,
  ].join("\n  ");
}

/** Bản 16px: ô to hơn, nét 13, tô mint. */
function markTiny(stroke = INK) {
  return [
    `<rect x="20" y="40" width="60" height="54" rx="18" fill="${MINT}" stroke="${stroke}" stroke-width="13"/>`,
    `<path d="M31 24 Q50 4 69 24" fill="none" stroke="${stroke}" stroke-width="13" stroke-linecap="round"/>`,
  ].join("\n  ");
}

function svg(viewBox, body, { width, height } = {}) {
  const size = width ? ` width="${width}" height="${height}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size}>\n  ${body}\n</svg>\n`;
}

// ---- Chữ → path -------------------------------------------------------------------------------

async function loadFont() {
  const file = path.join(cache, "Quicksand.ttf");
  if (!existsSync(file)) {
    await mkdir(cache, { recursive: true });
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`tải font thất bại: ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return fontkit.openSync(file).getVariation({ wght: 700 });
}

/**
 * Trả về `{ paths, width, top, bottom }` của chuỗi `text` ở cỡ `size` (đơn vị SVG), baseline y=0,
 * x bắt đầu từ 0. `top`/`bottom` là bbox thật của glyph (âm = trên baseline).
 */
function textPaths(font, text, size, fill) {
  const s = size / font.unitsPerEm;
  const run = font.layout(text);
  let x = 0;
  let top = Infinity;
  let bottom = -Infinity;
  const parts = [];
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    const d = g.path.toSVG();
    if (d) {
      const gx = (x + p.xOffset) * s;
      const gy = -p.yOffset * s;
      parts.push(
        `<path transform="translate(${r2(gx)} ${r2(gy)}) scale(${r4(s)} ${r4(-s)})" d="${d}"/>`,
      );
      const b = g.bbox;
      top = Math.min(top, gy - b.maxY * s);
      bottom = Math.max(bottom, gy - b.minY * s);
    }
    x += p.xAdvance;
  });
  return { paths: `<g fill="${fill}">${parts.join("")}</g>`, width: x * s, top, bottom };
}

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

// ---- Lắp ghép ---------------------------------------------------------------------------------

/** Logo ngang: mark thay chữ ô + "kìa" viết thường, baseline = đáy ô (y=89). */
function logo(font, color) {
  const text = textPaths(font, "kìa", 62, color);
  const tx = 86;
  const ty = 89;
  const w = Math.ceil(tx + text.width + 2);
  const body = `${markBody({ stroke: color })}\n  <g transform="translate(${tx} ${ty})">${text.paths}</g>`;
  return svg(`0 0 ${w} 100`, body);
}

/**
 * Bảng hiệu trang chủ (học cách noitu.fun làm 2026-10-21): mark giấy + "kìa" san hô + ".io.vn" mint
 * nhỏ hơn, cùng baseline — tên miền nằm ngay trong tên.
 */
function logoHero(font) {
  const name = textPaths(font, "kìa", 62, CORAL);
  const domain = textPaths(font, ".io.vn", 30, MINT);
  const tx = 86;
  const ty = 89;
  const dx = tx + name.width + 6;
  const w = Math.ceil(dx + domain.width + 2);
  const body = [
    markBody({ stroke: PAPER }),
    `<g transform="translate(${tx} ${ty})">${name.paths}</g>`,
    `<g transform="translate(${r2(dx)} ${ty})">${domain.paths}</g>`,
  ].join("\n  ");
  return svg(`0 0 ${w} 100`, body);
}

/** Wordmark "ô kìa" thuần chữ. */
function wordmark(font, fill) {
  const text = textPaths(font, "ô kìa", 80, fill);
  const pad = 4;
  const w = Math.ceil(text.width + pad * 2);
  const h = Math.ceil(text.bottom - text.top + pad * 2);
  const body = `<g transform="translate(${pad} ${r2(pad - text.top)})">${text.paths}</g>`;
  return svg(`0 0 ${w} ${h}`, body);
}

/** Icon vuông nền mint (apple-touch, PWA maskable): mark nét mực chiếm ~76% giữa ô. */
function tileSvg(size) {
  const m = size * 0.76;
  const off = (size - m) / 2;
  return svg(
    `0 0 ${size} ${size}`,
    `<rect width="${size}" height="${size}" fill="${MINT}"/>\n  <g transform="translate(${off} ${off}) scale(${m / 100})">${markBody()}</g>`,
    { width: size, height: size },
  );
}

/** Ảnh OG 1200×630: nền xanh bảng, thẻ giấy bo tròn mềm với logo + domain. */
function ogSvg(font) {
  const W = 1200;
  const H = 630;
  const card = { x: 150, y: 115, w: 900, h: 400 };
  const text = textPaths(font, "kìa", 150, INK);
  const markSize = 240;
  const gap = -6;
  const total = markSize + gap + text.width;
  const x0 = card.x + (card.w - total) / 2;
  const yMid = card.y + 150;
  const domain = textPaths(font, "okia.io.vn", 40, INK);
  return svg(
    `0 0 ${W} ${H}`,
    [
      `<rect width="${W}" height="${H}" fill="${GREEN}"/>`,
      `<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="48" fill="${PAPER}"/>`,
      `<g transform="translate(${r2(x0)} ${r2(yMid - markSize / 2)}) scale(${markSize / 100})">${markBody()}</g>`,
      `<g transform="translate(${r2(x0 + markSize + gap)} ${r2(yMid + markSize * 0.39)})">${text.paths}</g>`,
      `<g transform="translate(${r2(card.x + (card.w - domain.width) / 2)} ${card.y + card.h - 48})" opacity="0.7">${domain.paths}</g>`,
    ].join("\n  "),
    { width: W, height: H },
  );
}

// ---- Ghi file ---------------------------------------------------------------------------------

async function main() {
  const font = await loadFont();
  const brand = path.join(root, "public", "brand");
  const app = path.join(root, "src", "app");
  await mkdir(brand, { recursive: true });

  const files = {
    [path.join(brand, "mark.svg")]: svg("0 0 100 100", markBody()),
    [path.join(brand, "mark-dark.svg")]: svg("0 0 100 100", markBody({ stroke: PAPER })),
    [path.join(brand, "logo.svg")]: logo(font, INK),
    [path.join(brand, "logo-dark.svg")]: logo(font, PAPER),
    [path.join(brand, "logo-hero.svg")]: logoHero(font),
    [path.join(brand, "wordmark.svg")]: wordmark(font, INK),
    [path.join(brand, "wordmark-dark.svg")]: wordmark(font, PAPER),
    // Favicon SVG (hiện ở 16–32px): nét dày, tô mint cho đỡ rỗng.
    [path.join(app, "icon.svg")]: svg("0 0 100 100", markBody({ fill: MINT, bold: true })),
  };
  for (const [file, content] of Object.entries(files)) await writeFile(file, content);

  const png = (svgText, size) =>
    sharp(Buffer.from(svgText), { density: 300 }).resize(size, size).png().toBuffer();

  // favicon.ico: 16 (bản lược), 32 và 48 (nét dày, tô mint).
  const ico = await pngToIco([
    await png(svg("0 0 100 100", markTiny()), 16),
    await png(svg("0 0 100 100", markBody({ fill: MINT, bold: true })), 32),
    await png(svg("0 0 100 100", markBody({ fill: MINT, bold: true })), 48),
  ]);
  await writeFile(path.join(app, "favicon.ico"), ico);

  await writeFile(path.join(app, "apple-icon.png"), await png(tileSvg(180), 180));

  // Logo cho email (client mail không hiện SVG): PNG trong suốt rộng 340 (hiện 170px, @2x).
  await writeFile(
    path.join(brand, "logo-email.png"),
    await sharp(Buffer.from(logo(font, INK)), { density: 300 })
      .resize({ width: 340 })
      .png()
      .toBuffer(),
  );
  await writeFile(path.join(brand, "icon-192.png"), await png(tileSvg(192), 192));
  await writeFile(path.join(brand, "icon-512.png"), await png(tileSvg(512), 512));

  const og = await sharp(Buffer.from(ogSvg(font)), { density: 150 })
    .resize(1200, 630)
    .png()
    .toBuffer();
  await writeFile(path.join(app, "[locale]", "opengraph-image.png"), og);

  // Xem nhanh: logo trên nền xanh.
  const preview = await sharp(
    Buffer.from(
      svg(
        "0 0 600 200",
        `<rect width="600" height="200" fill="${GREEN}"/><g transform="translate(40 40) scale(1.2)">${await readFile(path.join(brand, "logo-dark.svg"), "utf8").then((s) => s.replace(/^<svg[^>]*>|<\/svg>\s*$/g, ""))}</g>`,
        { width: 600, height: 200 },
      ),
    ),
    { density: 150 },
  )
    .png()
    .toBuffer();
  await mkdir(path.join(root, ".shots"), { recursive: true });
  await writeFile(path.join(root, ".shots", "brand-preview.png"), preview);
  console.log("brand: da ghi", Object.keys(files).length, "svg + ico/png/og");
}

await main();
