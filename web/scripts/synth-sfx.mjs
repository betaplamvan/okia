// Tổng hợp các tiếng không có sẵn trong gói CC0: tiếng bút chì vẽ, "ting" ăn ô (cao dần theo combo),
// tiếng đổi lượt, bộ tiếng theo skin bút (kể cả whoosh / bùng lửa của Bút lửa). Xuất WAV 48 kHz mono vào shared/audio/core/ (nguồn), sau đó pipeline ghép sprite.
//
//   node scripts/synth-sfx.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SR = 48000;
const outDir = fileURLToPath(new URL("../../shared/audio/core/", import.meta.url));
mkdirSync(outDir, { recursive: true });

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

// RNG có seed để file sinh ra ổn định giữa các lần chạy.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(s, peak = 0.89) {
  const m = Math.max(...s.map(Math.abs)) || 1;
  return s.map((v) => (v / m) * peak);
}

/** Tiếng bút chì: nhiễu lọc dải + biên độ run tay theo "nét kéo". */
function pencil(seed, durMs) {
  const r = rng(seed);
  const n = Math.floor((SR * durMs) / 1000);
  const out = new Array(n).fill(0);
  // Lọc thông dải đơn giản (2 cực) quanh 2.2 kHz để có chất "sột soạt".
  let y1 = 0,
    y2 = 0,
    x1 = 0,
    x2 = 0;
  const f = 2200 / SR,
    q = 0.9;
  const w = 2 * Math.PI * f,
    alpha = Math.sin(w) / (2 * q);
  const b0 = alpha,
    b1 = 0,
    b2 = -alpha,
    a0 = 1 + alpha,
    a1 = -2 * Math.cos(w),
    a2 = 1 - alpha;
  let grain = 1;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Biên độ: vào nhanh, ra chậm, có "hạt" ngẫu nhiên như giấy ráp.
    if (i % 90 === 0) grain = 0.55 + r() * 0.45;
    const env = Math.min(1, t * 12) * Math.pow(1 - t, 0.6) * grain;
    const x = (r() * 2 - 1) * env;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y * 2.5;
  }
  return normalize(out, 0.6);
}

/** "Ting" ăn ô: hai sóng sin hài, decay nhanh; `rate` nâng cao độ theo combo. */
function ting(freq, durMs = 320) {
  const n = Math.floor((SR * durMs) / 1000);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 11) * Math.min(1, i / 60);
    out[i] =
      env *
      (Math.sin(2 * Math.PI * freq * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2.76 * t) * 0.25 +
        Math.sin(2 * Math.PI * freq * 5.4 * t) * 0.08);
  }
  return normalize(out, 0.8);
}

/** Tiếng đổi lượt: cú gõ gỗ ngắn (nhiễu + sin trầm, decay rất nhanh). */
function knock(seed) {
  const r = rng(seed);
  const n = Math.floor(SR * 0.09);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 55);
    out[i] =
      env * (Math.sin(2 * Math.PI * 180 * t) * 0.8 + (r() * 2 - 1) * 0.35 * Math.exp(-t * 120));
  }
  return normalize(out, 0.7);
}

/** Arpeggio thắng / thua. */
function arpeggio(freqs, stepMs, decay) {
  const n = Math.floor((SR * (stepMs * freqs.length + 500)) / 1000);
  const out = new Array(n).fill(0);
  freqs.forEach((f, k) => {
    const start = Math.floor((SR * stepMs * k) / 1000);
    for (let i = start; i < n; i++) {
      const t = (i - start) / SR;
      out[i] +=
        Math.exp(-t * decay) *
        (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.15);
    }
  });
  return normalize(out, 0.8);
}

/** Tiếng COMBO: arpeggio rất nhanh + lớp "lấp lánh" (nhiễu cao, lọc thông cao). */
function sparkle(seed) {
  const r = rng(seed);
  const freqs = [659.25, 783.99, 987.77, 1318.5, 1567.98];
  const stepMs = 45;
  const n = Math.floor((SR * (stepMs * freqs.length + 420)) / 1000);
  const out = new Array(n).fill(0);
  freqs.forEach((f, k) => {
    const start = Math.floor((SR * stepMs * k) / 1000);
    for (let i = start; i < n; i++) {
      const t = (i - start) / SR;
      out[i] +=
        Math.exp(-t * 9) *
        (Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 3 * t) * 0.12);
    }
  });
  // Lấp lánh: nhiễu trắng lọc thông cao đơn giản (sai phân), rải thành hạt ngắn.
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const x = r() * 2 - 1;
    const hp = x - prev;
    prev = x;
    const gate = Math.sin(2 * Math.PI * 38 * t) > 0.6 ? 1 : 0.15;
    out[i] += hp * 0.18 * gate * Math.exp(-t * 6) * Math.min(1, t * 40);
  }
  return normalize(out, 0.8);
}

/** Tiếng đếm ô cuối ván: "pop" rất ngắn, mềm. */
function pop(freq = 1200) {
  const n = Math.floor(SR * 0.06);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 70) * Math.min(1, i / 30);
    out[i] = env * (Math.sin(2 * Math.PI * freq * t * (1 - t * 3)) * 0.8);
  }
  return normalize(out, 0.7);
}

// ---------- Bộ tiếng theo skin bút (docs/08 — mỗi bút có capture/combo riêng) ----------

/** Sóng vuông/sin có trượt cao độ (f0 → f1) và decay; dùng cho blip neon, blob mực, squeak dạ. */
function slide(f0, f1, durMs, { shape = "sin", decay = 14, attack = 40 } = {}) {
  const n = Math.floor((SR * durMs) / 1000);
  const out = new Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = f0 + (f1 - f0) * t;
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-(i / SR) * decay) * Math.min(1, i / attack);
    const v = shape === "square" ? Math.sign(Math.sin(phase)) * 0.6 : Math.sin(phase);
    out[i] = env * v;
  }
  return normalize(out, 0.75);
}

/** Ting mềm (bút chì, sáp): ít hài, thêm chút nhiễu giấy, tắt nhanh. */
function tingSoft(seed, freq = 740) {
  const r = rng(seed);
  const n = Math.floor(SR * 0.22);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 16) * Math.min(1, i / 80);
    out[i] =
      env * (Math.sin(2 * Math.PI * freq * t) * 0.8 + (r() * 2 - 1) * 0.12 * Math.exp(-t * 60));
  }
  return normalize(out, 0.7);
}

/** Blob mực: trượt xuống trầm, hơi "ục". */
function blob(seed) {
  const r = rng(seed);
  const base = slide(520, 180, 200, { decay: 12 });
  return normalize(
    base.map((v, i) => v + (r() * 2 - 1) * 0.05 * Math.exp(-(i / SR) * 40)),
    0.75,
  );
}

/** Gõ phấn: click nhiễu sáng + sin cao rất ngắn. */
function tap(seed) {
  const r = rng(seed);
  const n = Math.floor(SR * 0.12);
  const out = new Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const x = r() * 2 - 1;
    const hp = x - prev;
    prev = x;
    out[i] =
      hp * 0.5 * Math.exp(-t * 90) + Math.sin(2 * Math.PI * 1900 * t) * 0.5 * Math.exp(-t * 45);
  }
  return normalize(out, 0.7);
}

/** Chuông: nhiều partial không hài, ngân lâu. */
function bell(freq, durMs = 700) {
  const n = Math.floor((SR * durMs) / 1000);
  const out = new Array(n);
  const partials = [
    [1, 0.6, 3.2],
    [2.0, 0.3, 4.5],
    [2.74, 0.25, 5],
    [4.1, 0.12, 7],
    [5.4, 0.08, 9],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [k, a, d] of partials)
      v += a * Math.sin(2 * Math.PI * freq * k * t) * Math.exp(-t * d);
    out[i] = v * Math.min(1, i / 40);
  }
  return normalize(out, 0.75);
}

/** Chuỗi tiếng nối nhau (combo): mỗi phần tử là mảng mẫu, cách nhau stepMs, cộng chồng. */
function sequence(parts, stepMs) {
  const step = Math.floor((SR * stepMs) / 1000);
  const n = step * (parts.length - 1) + Math.max(...parts.map((p) => p.length));
  const out = new Array(n).fill(0);
  parts.forEach((p, k) => {
    for (let i = 0; i < p.length; i++) out[k * step + i] += p[i];
  });
  return normalize(out, 0.8);
}

/** Bụi phấn: 4 bụm nhiễu lọc thông cao, cao dần. */
function chalkDust(seed) {
  const r = rng(seed);
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const n = Math.floor(SR * 0.09);
    const p = new Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const x = r() * 2 - 1;
      const hp = x - prev * (0.6 - k * 0.1);
      prev = x;
      p[i] = hp * Math.exp(-t * 50) * 0.6;
    }
    parts.push(p);
  }
  return sequence(parts, 55);
}

/**
 * Nhiễu lọc thông dải 2 cực, tâm trượt f0 → f1 theo thời gian (whoosh / lửa). `env(t)` biên độ
 * theo tiến độ 0–1.
 */
function sweepNoise(seed, durMs, f0, f1, q, env) {
  const r = rng(seed);
  const n = Math.floor((SR * durMs) / 1000);
  const out = new Array(n);
  let y1 = 0,
    y2 = 0,
    x1 = 0,
    x2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = (f0 * Math.pow(f1 / f0, t)) / SR;
    const w = 2 * Math.PI * f;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const x = (r() * 2 - 1) * env(t);
    const y = (alpha * x - alpha * x2 - -2 * Math.cos(w) * y1 - (1 - alpha) * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y * 3;
  }
  return out;
}

/** Whoosh lửa ăn ô: bụm nhiễu ngắn, tâm lọc vút lên rồi tắt nhanh. */
function fireWhoosh(seed) {
  const base = sweepNoise(
    seed,
    230,
    350,
    2600,
    1.4,
    (t) => Math.min(1, t * 9) * Math.pow(1 - t, 1.6),
  );
  // Thêm một "phụt" trầm ở đầu cho có lực.
  return normalize(
    base.map((v, i) => {
      const t = i / SR;
      return v + Math.sin(2 * Math.PI * (160 - 90 * t * 6) * t) * 0.35 * Math.exp(-t * 28);
    }),
    0.78,
  );
}

/** Bùng lửa combo: nhiễu dâng lên rồi hạ (swell) + rumble trầm + tiếng lách tách. */
function fireFlare(seed) {
  const r = rng(seed + 1);
  const durMs = 620;
  const swell = sweepNoise(seed, durMs, 500, 1800, 1.1, (t) =>
    Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.3),
  );
  const n = swell.length;
  const out = new Array(n);
  let crackleGate = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = i / n;
    // Rumble: sin trầm 70 → 48 Hz, hơi méo.
    const rum =
      Math.tanh(Math.sin(2 * Math.PI * (70 - 22 * p) * t) * 1.6) *
      0.45 *
      Math.sin(Math.PI * Math.min(1, p * 1.2));
    // Lách tách: click ngẫu nhiên thưa, dày hơn ở đỉnh.
    if (crackleGate <= 0 && r() < 0.0025 * (0.4 + Math.sin(Math.PI * p)))
      crackleGate = 60 + Math.floor(r() * 80);
    let crack = 0;
    if (crackleGate > 0) {
      crack = (r() * 2 - 1) * 0.5 * (crackleGate / 140);
      crackleGate--;
    }
    out[i] = swell[i] * 0.8 + rum + crack;
  }
  return normalize(out, 0.82);
}

/**
 * "Ready check" khi ghép được trận (docs/07): lớp đệm trầm dâng lên (hai nốt quãng năm, hơi răng
 * cưa) + chuông sáng ba nốt đi lên rồi ngân, ~1,4 s — nghe rõ dù đang ở tab / trang khác.
 */
function readyCheck() {
  const durMs = 1400;
  const n = Math.floor((SR * durMs) / 1000);
  const out = new Array(n).fill(0);
  // Đệm: 130,8 Hz (C3) + 196 Hz (G3), răng cưa mềm (5 bội), dâng 0 → 1 trong 350 ms, tắt từ 900 ms.
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.35) * (t < 0.9 ? 1 : Math.exp(-(t - 0.9) * 6));
    let v = 0;
    for (const f of [130.81, 196]) {
      for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * f * k * t) / (k * 1.6);
    }
    out[i] += v * env * 0.11;
  }
  // Chuông: C5 → E5 → G5 cách 140 ms, ngân dài; nốt cuối thêm C6 nhỏ.
  const bells = [
    [523.25, 0.0, 1.0],
    [659.25, 0.14, 1.0],
    [783.99, 0.28, 1.2],
    [1046.5, 0.3, 0.45],
  ];
  for (const [f, at, amp] of bells) {
    const start = Math.floor(SR * at);
    const b = bell(f, 1000);
    for (let i = 0; i < b.length && start + i < n; i++) out[start + i] += b[i] * amp * 0.55;
  }
  return normalize(out, 0.9);
}

/** Tiếng đồ ném (docs/08 — Đồ ném): ném (vút xuống) và trúng theo hiệu ứng. */
function whoosh() {
  return sequence([slide(1100, 260, 220, { decay: 9, attack: 20 })], 10);
}

const files = {
  "match_found.wav": readyCheck(),
  "throw.wav": whoosh(),
  "hit_splat.wav": sequence([blob(303), tap(305)], 40),
  "hit_crack.wav": sequence([tap(311), slide(520, 180, 260, { decay: 7 })], 30),
  "hit_explode.wav": sequence([knock(313), fireFlare(317)], 20),
  "hit_bounce.wav": sequence([knock(331), pop(720), pop(540)], 90),
  "hit_petals.wav": sparkle(337),
  "hit_confetti.wav": sequence([pop(900), arpeggio([783.99, 987.77, 1174.66, 1567.98], 70, 5)], 30),
  "combo.wav": sparkle(71),
  "capture_fire.wav": fireWhoosh(41),
  "combo_fire.wav": fireFlare(43),
  "capture_soft.wav": tingSoft(3),
  "capture_marker.wav": slide(600, 1250, 140, { decay: 18 }),
  "capture_ink.wav": blob(9),
  "capture_chalk.wav": tap(13),
  "capture_neon.wav": slide(440, 880, 160, { shape: "square", decay: 16 }),
  "capture_bell.wav": bell(1046.5),
  "combo_ink.wav": sequence([slide(300, 520, 120), slide(380, 640, 120), slide(460, 780, 160)], 70),
  "combo_chalk.wav": chalkDust(17),
  "combo_neon.wav": sequence(
    [659.25, 830.61, 987.77, 1318.5].map((f) => slide(f, f, 110, { shape: "square", decay: 20 })),
    60,
  ),
  "combo_bell.wav": sequence([bell(1318.5, 450), bell(1567.98, 450), bell(2093, 600)], 90),
  "count.wav": pop(),
  "draw_01.wav": pencil(11, 170),
  "draw_02.wav": pencil(23, 190),
  "draw_03.wav": pencil(37, 160),
  "capture.wav": ting(880),
  "turn.wav": knock(5),
  "win.wav": arpeggio([523.25, 659.25, 783.99, 1046.5], 110, 4),
  "lose.wav": arpeggio([392, 329.63, 261.63], 160, 3.5),
};
for (const [name, samples] of Object.entries(files)) {
  writeFileSync(outDir + name, wav(samples));
  console.log(`đã ghi ${name} (${(samples.length / SR).toFixed(2)}s)`);
}
