"use client";

import type { ThrowSkin } from "@/game/skins/skins";

/**
 * Hình đồ ném vẽ bằng SVG inline (docs/08 — Đồ ném): không cần file ảnh, nhuộm theo `color` /
 * `color2` của manifest. `icon = image` → ảnh trong gói skin (assets).
 */
const INK = "#1a2826";

export function ThrowIcon({
  skin,
  size = 40,
  imageUrl,
}: {
  skin: ThrowSkin;
  size?: number;
  /** URL ảnh khi icon = image (assetUrl(skin, skin.throw.image)). */
  imageUrl?: string | null;
}) {
  const { icon, color, color2 } = skin.throw;
  const c1 = color ?? DEFAULT_COLORS[icon]?.[0] ?? "#ff6b6b";
  const c2 = color2 ?? DEFAULT_COLORS[icon]?.[1] ?? "#ffd93d";
  if (icon === "image") {
    return imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" width={size} height={size} style={{ display: "block" }} />
    ) : (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <rect x="10" y="10" width="44" height="44" rx="10" fill={c1} stroke={INK} strokeWidth="4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ display: "block" }}>
      {ICONS[icon](c1, c2)}
    </svg>
  );
}

const DEFAULT_COLORS: Record<string, [string, string]> = {
  paper: ["#f5f1e8", "#cfc7b6"],
  tomato: ["#e5321c", "#ff6b4a"],
  egg: ["#ffd93d", "#fff6c2"],
  flower: ["#ff6fbc", "#7cf5c5"],
  slipper: ["#1e4fd8", "#8ec5ff"],
  cake: ["#fff6c2", "#ff9fd0"],
  bomb: ["#1a2826", "#ff9f1c"],
  confetti: ["#ffd93d", "#ff6fbc"],
};

const ICONS: Record<string, (c1: string, c2: string) => React.ReactNode> = {
  paper: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
      <path d="M20,12 L44,10 L54,22 L52,46 L36,56 L14,50 L10,28 Z" fill={c1} />
      <path d="M20,12 L30,30 L52,46 M30,30 L14,50 M30,30 L44,10" fill="none" stroke={c2} />
    </g>
  ),
  tomato: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
      <ellipse cx="32" cy="36" rx="22" ry="19" fill={c1} />
      <path d="M22,32 C26,26 36,26 42,30" fill="none" stroke={c2} strokeWidth="3" />
      <path
        d="M32,18 L28,10 M32,18 L40,12 M32,18 L24,14 M32,18 L38,20"
        stroke="#2fbf71"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </g>
  ),
  egg: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5">
      <path
        d="M32,8 C44,8 54,26 54,40 C54,52 44,58 32,58 C20,58 10,52 10,40 C10,26 20,8 32,8 Z"
        fill={c2}
      />
      <ellipse cx="26" cy="28" rx="5" ry="8" fill={c1} opacity="0.5" stroke="none" />
    </g>
  ),
  flower: (c1, c2) => (
    <g stroke={INK} strokeWidth="3">
      <path d="M32,34 L32,58" stroke="#2fbf71" strokeWidth="4" />
      <path d="M32,48 C24,46 22,40 24,38 C30,38 32,44 32,48" fill={c2} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse
          key={a}
          cx="32"
          cy="18"
          rx="7"
          ry="10"
          fill={c1}
          transform={`rotate(${a} 32 28)`}
        />
      ))}
      <circle cx="32" cy="28" r="7" fill="#ffd93d" />
    </g>
  ),
  slipper: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
      <path
        d="M20,8 C34,6 44,12 46,26 C48,40 44,56 32,58 C20,58 16,44 16,30 C16,20 16,10 20,8 Z"
        fill={c1}
      />
      <path
        d="M22,30 C26,20 38,20 42,30"
        fill="none"
        stroke={c2}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <g fill={c2} stroke="none">
        {[
          [26, 40],
          [34, 40],
          [30, 47],
          [26, 54],
          [34, 54],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" />
        ))}
      </g>
    </g>
  ),
  cake: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
      <path d="M8,36 L56,36 L52,54 L12,54 Z" fill={c2} />
      <path d="M8,36 C14,24 50,24 56,36 Z" fill={c1} />
      <path
        d="M14,36 C18,42 22,34 26,40 C30,46 34,34 38,40 C42,46 46,34 50,40"
        fill="none"
        stroke={c1}
        strokeWidth="3"
      />
      <circle cx="32" cy="22" r="4" fill="#e5321c" />
    </g>
  ),
  bomb: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
      <circle cx="30" cy="38" r="20" fill={c1} />
      <circle cx="24" cy="32" r="5" fill="#fffcf2" opacity="0.35" stroke="none" />
      <rect x="34" y="12" width="10" height="10" rx="2" fill="#8a8378" />
      <path
        d="M44,14 C50,10 54,6 56,8"
        fill="none"
        stroke={c2}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="56" cy="8" r="4" fill={c2} stroke="none" />
    </g>
  ),
  confetti: (c1, c2) => (
    <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
      <path d="M14,54 L30,22 L46,38 Z" fill={c1} />
      <path d="M14,54 L22,38 L38,46 Z" fill={c2} opacity="0.7" stroke="none" />
      <g fill={c2} stroke="none">
        <rect x="36" y="10" width="6" height="6" transform="rotate(20 39 13)" />
        <rect x="48" y="18" width="6" height="6" transform="rotate(-30 51 21)" />
        <rect x="50" y="32" width="6" height="6" transform="rotate(45 53 35)" />
        <circle cx="42" cy="26" r="3" fill="#7cf5c5" />
        <circle cx="30" cy="12" r="3" fill="#8ec5ff" />
      </g>
    </g>
  ),
};

/** Hiệu ứng khi trúng (vẽ tại chip đối thủ), nhuộm theo màu vật phẩm. */
export function SplatArt({
  splat,
  c1,
  c2,
  size = 120,
}: {
  splat: string;
  c1: string;
  c2: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="-60 -60 120 120"
      width={size}
      height={size}
      aria-hidden
      style={{ display: "block" }}
    >
      {SPLATS[splat]?.(c1, c2) ?? SPLATS.splat(c1, c2)}
    </svg>
  );
}

const SPLATS: Record<string, (c1: string, c2: string) => React.ReactNode> = {
  splat: (c1, c2) => (
    <g>
      <path
        d="M-4,-44 C8,-40 10,-30 24,-34 C34,-36 42,-22 36,-12 C50,-6 48,10 36,14 C40,28 28,40 16,32 C8,46 -10,44 -14,30 C-30,38 -44,26 -36,12 C-50,4 -46,-14 -32,-16 C-38,-30 -24,-42 -12,-34 C-10,-42 -8,-46 -4,-44 Z"
        fill={c1}
        opacity="0.9"
      />
      <circle cx="-8" cy="-6" r="10" fill={c2} opacity="0.6" />
      <circle cx="14" cy="8" r="5" fill={c2} opacity="0.6" />
      <circle cx="-30" cy="22" r="4" fill={c1} />
      <circle cx="34" cy="-30" r="3" fill={c1} />
    </g>
  ),
  crack: (c1, c2) => (
    <g>
      <path
        d="M-30,-10 C-20,-30 20,-30 30,-10 C38,8 24,30 0,30 C-24,30 -38,8 -30,-10 Z"
        fill={c1}
        opacity="0.85"
      />
      <path
        d="M-10,0 L-6,30 L-2,10 L4,34 L8,12"
        fill="none"
        stroke={c1}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M-22,-20 L-10,-8 L-4,-18 L6,-6 L16,-16 L24,-6"
        fill="none"
        stroke="#fffcf2"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="0" cy="2" r="8" fill={c2} opacity="0.8" />
    </g>
  ),
  explode: (c1, c2) => (
    <g>
      <path
        d="M0,-56 L12,-24 L44,-40 L26,-12 L58,0 L26,12 L44,40 L12,24 L0,56 L-12,24 L-44,40 L-26,12 L-58,0 L-26,-12 L-44,-40 L-12,-24 Z"
        fill={c2}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M0,-30 L8,-12 L26,-20 L14,-6 L30,0 L14,6 L26,20 L8,12 L0,30 L-8,12 L-26,20 L-14,6 L-30,0 L-14,-6 L-26,-20 L-8,-12 Z"
        fill="#fff6c2"
      />
      <text
        x="0"
        y="8"
        textAnchor="middle"
        fontFamily="inherit"
        fontWeight="700"
        fontSize="22"
        fill={c1 === INK ? "#e5321c" : c1}
      >
        BÙM
      </text>
    </g>
  ),
  bounce: (c1, c2) => (
    <g fill="none" stroke={c2} strokeWidth="4" strokeLinecap="round">
      <path d="M-40,-30 L-50,-40 M40,-30 L50,-40 M-44,20 L-54,26 M44,20 L54,26" />
      <circle cx="0" cy="0" r="34" stroke={c1} strokeWidth="5" opacity="0.6" />
    </g>
  ),
  petals: (c1, c2) => (
    <g>
      {[
        [-30, -20, 10],
        [20, -34, -20],
        [36, 6, 40],
        [-8, 30, 70],
        [-38, 18, -50],
        [10, 14, 100],
        [-14, -40, 30],
      ].map(([x, y, r], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx="7"
          ry="11"
          fill={i % 2 ? c2 : c1}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </g>
  ),
  confetti: (c1, c2) => (
    <g>
      {[
        [-40, -20, c1],
        [-20, -44, c2],
        [8, -36, "#7cf5c5"],
        [30, -24, c1],
        [44, 4, c2],
        [26, 30, "#8ec5ff"],
        [-6, 40, c1],
        [-34, 26, c2],
        [-48, 2, "#7cf5c5"],
        [4, -8, c2],
      ].map(([x, y, c], i) => (
        <rect
          key={i}
          x={Number(x) - 5}
          y={Number(y) - 3}
          width="10"
          height="6"
          fill={String(c)}
          transform={`rotate(${i * 37} ${x} ${y})`}
        />
      ))}
    </g>
  ),
};
