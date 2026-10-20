// Pipeline âm thanh (docs/12): nguồn trong shared/audio/ → web/public/assets/audio/ (gitignore).
//   - Hiệu ứng: ghép thành MỘT audio sprite (core.webm Opus + core.mp3 dự phòng) + core.json
//     {name: [startMs, durationMs]} để Howler phát từng đoạn (ít request, phát tức thì trên iOS).
//   - Nhạc nền: từng file, chuẩn hóa âm lượng (loudnorm), xuất webm + mp3.
//
//   node scripts/build-audio.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");

const root = fileURLToPath(new URL("../../", import.meta.url));
const SRC_SFX = [join(root, "shared/audio/core"), join(root, "shared/audio/ui")];
const SRC_MUSIC = join(root, "shared/audio/music");
const OUT = join(root, "web/public/assets/audio");
const SR = 48000;
const GAP_MS = 250;

mkdirSync(join(OUT, "music"), { recursive: true });

const run = (args) =>
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "pipe", "inherit"],
  });

// ---------- Sprite hiệu ứng ----------
const sources = SRC_SFX.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.(wav|ogg|mp3)$/i.test(f))
    .map((f) => ({ name: f.replace(/\.[^.]+$/, ""), path: join(dir, f) })),
).sort((a, b) => a.name.localeCompare(b.name));

const chunks = [];
const sprite = {};
let cursor = 0; // ms
const gap = Buffer.alloc(Math.round((SR * GAP_MS) / 1000) * 2);
for (const s of sources) {
  // Giải mã về PCM s16le 48 kHz mono để đo chính xác và ghép không mất mát.
  const pcm = run(["-i", s.path, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"]);
  const durMs = Math.round((pcm.length / 2 / SR) * 1000);
  sprite[s.name] = [cursor, durMs];
  chunks.push(pcm, gap);
  cursor += durMs + GAP_MS;
}
const raw = join(OUT, "core.raw");
writeFileSync(raw, Buffer.concat(chunks));
const rawIn = ["-f", "s16le", "-ar", String(SR), "-ac", "1", "-i", raw];
run([...rawIn, "-c:a", "libopus", "-b:a", "64k", join(OUT, "core.webm")]);
run([...rawIn, "-c:a", "libmp3lame", "-b:a", "96k", join(OUT, "core.mp3")]);
writeFileSync(join(OUT, "core.json"), JSON.stringify({ sprite }, null, 2) + "\n");
require("node:fs").rmSync(raw);
console.log(
  `sprite: ${sources.length} tiếng, ${(cursor / 1000).toFixed(1)}s → core.webm / core.mp3 / core.json`,
);

// ---------- Nhạc nền ----------
const tracks = readdirSync(SRC_MUSIC).filter((f) => /\.(ogg|mp3|wav|flac)$/i.test(f));
for (const f of tracks) {
  const name = f.replace(/\.[^.]+$/, "");
  const input = join(SRC_MUSIC, f);
  // loudnorm về -18 LUFS để nhạc không át hiệu ứng; stereo giữ nguyên.
  const filt = ["-af", "loudnorm=I=-18:TP=-1.5:LRA=11"];
  run(["-i", input, ...filt, "-c:a", "libopus", "-b:a", "80k", join(OUT, "music", `${name}.webm`)]);
  run([
    "-i",
    input,
    ...filt,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "112k",
    join(OUT, "music", `${name}.mp3`),
  ]);
  console.log(`music: ${name} → webm / mp3`);
}

// Manifest để client biết có những bản nào.
writeFileSync(
  join(OUT, "music", "index.json"),
  JSON.stringify({ tracks: tracks.map((f) => f.replace(/\.[^.]+$/, "")) }, null, 2) + "\n",
);
const sizes = readdirSync(OUT)
  .filter((f) => f.startsWith("core."))
  .map((f) => `${f} ${(readFileSync(join(OUT, f)).length / 1024).toFixed(0)} KB`);
console.log(sizes.join(" | "));
