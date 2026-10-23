"use client";

import { Box } from "@chakra-ui/react";
import { useId } from "react";
import type { RankOut, Tier } from "@/lib/api";

/**
 * Huy hiệu hạng (docs/07, thiết kế duyệt 2026-10-21): một dáng khiên vở học trò viền mực, bóng cứng
 * sticker; mỗi bậc thêm một lớp "đồ" (giấy → trang vở → bút chéo → dấu 10 → mũ tốt nghiệp → mũ cánh
 * chuồn + hào quang). Vẽ bằng SVG inline (không asset ngoài), tự rút gọn chi tiết khi nhỏ:
 * - size ≥ 64: đủ nguyệt quế, mũ, chữ, sao bậc con dưới khiên (III → I) hoặc #thứ hạng với Thủ khoa.
 * - size < 64: chỉ khiên màu + hình chính, viền dày hơn để không nhòe.
 * rank = null → khiên phân hạng (giấy xám, viền đứt, dấu hỏi).
 * Trạng nguyên (2026-10-23): rực lửa — lưỡi lửa bập bùng sau khiên, tàn lửa bay lên, vệt sáng lướt
 * qua khiên, quầng cam thở nhịp; lửa vẽ tràn ra ngoài khung (overflow visible). size < 40 (pill) chỉ
 * có quầng. prefers-reduced-motion → đứng yên.
 */
const INK = "#1a2826";
const PAPER = "#fffcf2";
const SUN = "#ffd93d";
const RED = "#d8341e";
const SHIELD = "M70,10 L118,28 V72 C118,102 94,122 70,132 C46,122 22,102 22,72 V28 Z";
const STAR_SM = "0,-6 1.8,-1.8 6,-1.5 2.8,1.4 3.7,5.8 0,3.4 -3.7,5.8 -2.8,1.4 -6,-1.5 -1.8,-1.8";
const FLAME_RED = "#ff4d1f";
const FLAME_ORANGE = "#ff9f1c";
// Lưỡi lửa: gốc (0,0) hướng lên, rộng w cao h (nhân tọa độ để nét viền không méo khi co giãn).
const FLAME_PTS = [
  [0, 0],
  [-0.42, -0.12, -0.5, -0.5, -0.22, -0.72],
  [-0.16, -0.52, -0.04, -0.5, 0, -0.62],
  [0.02, -0.8, 0.1, -0.9, 0, -1],
  [0.3, -0.86, 0.5, -0.5, 0.36, -0.2],
  [0.3, -0.08, 0.16, 0, 0, 0],
];
function flamePath(w: number, h: number, dy = 0): string {
  const f = (v: number[]) =>
    v.map((n, i) => (i % 2 === 0 ? (n * w).toFixed(1) : (n * h + dy).toFixed(1))).join(",");
  const [m, ...cs] = FLAME_PTS;
  return `M${f(m)} ${cs.map((c) => `C${f(c.slice(0, 2))} ${f(c.slice(2, 4))} ${f(c.slice(4))}`).join(" ")} Z`;
}
// [x, y, chiều cao, góc nghiêng, độ trễ s] — quanh mép trên và hai bên khiên.
const FLAMES: [number, number, number, number, number][] = [
  [70, 18, 50, 0, 0],
  [46, 20, 46, -14, 0.25],
  [94, 20, 46, 14, 0.5],
  [24, 34, 46, -30, 0.15],
  [116, 34, 46, 30, 0.4],
  [10, 66, 40, -48, 0.6],
  [130, 66, 40, 48, 0.05],
  [14, 100, 32, -64, 0.35],
  [126, 100, 32, 64, 0.7],
  [40, 128, 22, -110, 0.2],
  [100, 128, 22, 110, 0.55],
];
// [x, y, r, độ trễ s] — tàn lửa bay lên.
const EMBERS: [number, number, number, number][] = [
  [40, 30, 2.4, 0],
  [100, 26, 2, 0.6],
  [58, 14, 1.8, 1.1],
  [86, 12, 2.2, 0.3],
  [20, 56, 1.8, 0.9],
  [122, 52, 2, 1.4],
];
const STAR_BIG = "70,54 80,78 106,78 85,93 93,118 70,103 47,118 55,93 34,78 60,78";

export const TIER_FILL: Record<Tier, string> = {
  scratch: "#e8e2d4",
  notebook: "#7cf5c5",
  good: SUN,
  honor: "#ff6fbc",
  valedictorian: "#ff6b6b",
  topscholar: "#1e4fd8",
};

type Props = {
  rank: RankOut | null | undefined;
  size?: number;
  /** Thứ hạng BXH ghi dưới khiên (Thủ khoa / Trạng nguyên, cỡ lớn). */
  position?: number | null;
  /** Hào quang thở nhịp cho Trạng nguyên (tắt khi prefers-reduced-motion). */
  animate?: boolean;
  label?: string;
};

export function RankEmblem({ rank, size = 44, position, animate = true, label }: Props) {
  const full = size >= 64;
  const tier = rank?.tier ?? null;
  const fill = tier ? TIER_FILL[tier] : TIER_FILL.scratch;
  const sw = full ? 3.5 : size >= 32 ? 5 : 8;
  const division = rank?.division ?? null;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const blaze = tier === "topscholar" && size >= 40;
  return (
    <Box
      as="span"
      display="inline-block"
      w={`${size}px`}
      h={`${Math.round((size * 150) / 140)}px`}
      flexShrink={0}
      css={tier === "topscholar" && animate ? BLAZE_CSS : undefined}
      data-testid="rank-emblem"
      data-tier={tier ?? "placing"}
    >
      <svg
        viewBox="0 0 140 150"
        width="100%"
        height="100%"
        overflow={blaze ? "visible" : undefined}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {tier === "topscholar" ? (
          <>
            <defs>
              <radialGradient id={`glow${uid}`}>
                <stop offset="0%" stopColor={SUN} stopOpacity="0.95" />
                <stop offset="55%" stopColor={FLAME_ORANGE} stopOpacity="0.55" />
                <stop offset="100%" stopColor={FLAME_RED} stopOpacity="0" />
              </radialGradient>
              <linearGradient id={`shine${uid}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                <stop offset="50%" stopColor="#fff" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <clipPath id={`clip${uid}`}>
                <path d={SHIELD} />
              </clipPath>
            </defs>
            <circle
              className="aura"
              cx="70"
              cy="70"
              r={blaze ? 84 : 66}
              fill={`url(#glow${uid})`}
            />
          </>
        ) : null}
        {blaze ? <Flames /> : null}
        {/* bóng cứng */}
        {full ? <path d={SHIELD} fill={INK} opacity="0.85" transform="translate(5 5)" /> : null}
        {full ? <Laurels tier={tier} /> : null}
        {/* khiên */}
        {tier === null ? (
          <path
            d={SHIELD}
            fill={fill}
            stroke={INK}
            strokeWidth={sw}
            strokeDasharray="9 6"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d={SHIELD}
            fill={fill}
            stroke={tier === "topscholar" ? SUN : INK}
            strokeWidth={tier === "topscholar" ? sw + 0.5 : sw}
            strokeLinejoin="round"
          />
        )}
        {tier === "topscholar" ? (
          <g clipPath={`url(#clip${uid})`}>
            <rect
              className="shine"
              x="-40"
              y="0"
              width="36"
              height="150"
              fill={`url(#shine${uid})`}
              transform="skewX(-20)"
            />
          </g>
        ) : null}
        <Face tier={tier} full={full} />
        {blaze ? <Embers /> : null}
        {full ? <Foot tier={tier} division={division} position={position ?? null} /> : null}
      </svg>
    </Box>
  );
}

const BLAZE_CSS = {
  "& .aura": {
    transformBox: "fill-box",
    transformOrigin: "50% 50%",
    animation: "okiaAura 1.6s ease-in-out infinite",
  },
  "& .flame": {
    transformBox: "fill-box",
    transformOrigin: "50% 100%",
    animation: "okiaFlame 0.7s ease-in-out infinite alternate",
  },
  "& .ember": { animation: "okiaEmber 1.8s ease-out infinite" },
  "& .shine": { transformBox: "fill-box", animation: "okiaShine 3.2s ease-in-out infinite" },
  "@keyframes okiaAura": {
    "0%, 100%": { opacity: 0.55, transform: "scale(0.96)" },
    "50%": { opacity: 0.95, transform: "scale(1.04)" },
  },
  "@keyframes okiaFlame": {
    "0%": { transform: "scale(0.9, 0.82) skewX(-5deg)" },
    "50%": { transform: "scale(1.05, 1.06) skewX(3deg)" },
    "100%": { transform: "scale(0.96, 1.16) skewX(-2deg)" },
  },
  "@keyframes okiaEmber": {
    "0%": { transform: "translateY(0)", opacity: 0 },
    "20%": { opacity: 1 },
    "100%": { transform: "translateY(-34px)", opacity: 0 },
  },
  "@keyframes okiaShine": {
    "0%": { transform: "skewX(-20deg) translateX(0)" },
    "55%, 100%": { transform: "skewX(-20deg) translateX(210px)" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "& .aura, & .flame, & .ember, & .shine": { animation: "none" },
    "& .ember, & .shine": { opacity: 0 },
  },
} as const;

/** Lưỡi lửa sau khiên Trạng nguyên: lớp đỏ ngoài, cam giữa, vàng lõi. */
function Flames() {
  return (
    <g>
      {FLAMES.map(([x, y, h, rot, delay]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <g className="flame" style={{ animationDelay: `${delay}s` }}>
            <path
              d={flamePath(h * 0.62, h)}
              fill={FLAME_RED}
              stroke={INK}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path d={flamePath(h * 0.42, h * 0.72, -1)} fill={FLAME_ORANGE} />
            <path d={flamePath(h * 0.24, h * 0.42, -1)} fill={SUN} />
          </g>
        </g>
      ))}
    </g>
  );
}

/** Tàn lửa bay lên quanh khiên Trạng nguyên. */
function Embers() {
  return (
    <g>
      {EMBERS.map(([x, y, r, delay]) => (
        <circle
          key={`${x}-${y}`}
          className="ember"
          cx={x}
          cy={y}
          r={r}
          fill={SUN}
          stroke={FLAME_RED}
          strokeWidth="0.8"
          opacity="0"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </g>
  );
}

/** Nguyệt quế / trang giấy xòe hai bên (chỉ cỡ lớn). */
function Laurels({ tier }: { tier: Tier | null }) {
  switch (tier) {
    case "notebook":
      return (
        <g fill={PAPER} stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M22,40 C8,44 6,70 18,84 L24,78 Z" />
          <path d="M118,40 C132,44 134,70 122,84 L116,78 Z" />
        </g>
      );
    case "good":
      return (
        <g fill={PAPER} stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M22,40 C6,36 4,66 16,86 L26,80 Z" />
          <path d="M118,40 C134,36 136,66 124,86 L114,80 Z" />
        </g>
      );
    case "honor":
      return (
        <g fill="#7cf5c5" stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M24,46 C10,40 6,60 12,74 C18,72 22,62 24,46 Z" />
          <path d="M20,70 C8,70 6,90 16,100 C22,94 22,80 20,70 Z" />
          <path d="M116,46 C130,40 134,60 128,74 C122,72 118,62 116,46 Z" />
          <path d="M120,70 C132,70 134,90 124,100 C118,94 118,80 120,70 Z" />
        </g>
      );
    case "valedictorian":
      return (
        <g fill={SUN} stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M24,40 C8,34 2,56 8,72 C16,70 22,56 24,40 Z" />
          <path d="M18,66 C4,66 2,90 12,104 C20,98 20,80 18,66 Z" />
          <path d="M24,96 C14,100 14,118 24,126 C30,118 28,106 24,96 Z" />
          <path d="M116,40 C132,34 138,56 132,72 C124,70 118,56 116,40 Z" />
          <path d="M122,66 C136,66 138,90 128,104 C120,98 120,80 122,66 Z" />
          <path d="M116,96 C126,100 126,118 116,126 C110,118 112,106 116,96 Z" />
        </g>
      );
    case "topscholar":
      return (
        <g fill={SUN} stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M24,40 C6,32 0,56 6,74 C14,72 22,56 24,40 Z" />
          <path d="M16,66 C0,66 0,92 10,108 C18,100 18,80 16,66 Z" />
          <path d="M22,96 C10,100 10,122 22,132 C30,122 28,106 22,96 Z" />
          <path d="M116,40 C134,32 140,56 134,74 C126,72 118,56 116,40 Z" />
          <path d="M124,66 C140,66 140,92 130,108 C122,100 122,80 124,66 Z" />
          <path d="M118,96 C130,100 130,122 118,132 C110,122 112,106 118,96 Z" />
          <path d="M50,126 C56,136 84,136 90,126 L86,134 C78,140 62,140 54,134 Z" />
        </g>
      );
    default:
      return null;
  }
}

/** Hình chính trong khiên. */
function Face({ tier, full }: { tier: Tier | null; full: boolean }) {
  switch (tier) {
    case null:
      return (
        <text
          x="70"
          y="90"
          textAnchor="middle"
          fontFamily="inherit"
          fontSize="56"
          fontWeight="700"
          fill={INK}
          opacity="0.6"
        >
          ?
        </text>
      );
    case "scratch":
      return (
        <g>
          <path
            d="M92,10 L118,28 L92,34 Z"
            fill="#cfc7b6"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {full ? (
            <g stroke="#8a8378" strokeWidth="2" fill="none" strokeLinecap="round">
              <path d="M40,56 L100,52" />
              <path d="M40,72 L96,68" />
              <path d="M40,88 L88,84" />
            </g>
          ) : null}
          <path
            d="M46,104 C56,96 60,112 70,100 C78,90 84,108 94,98"
            fill="none"
            stroke="#5b5650"
            strokeWidth={full ? 3 : 6}
            strokeLinecap="round"
          />
        </g>
      );
    case "notebook":
      return (
        <g>
          {full ? (
            <g stroke={INK} strokeWidth="1" opacity="0.25">
              <path d="M22,44 H118" />
              <path d="M22,60 H118" />
              <path d="M23,76 H117" />
              <path d="M28,92 H112" />
              <path d="M38,108 H102" />
              <path d="M46,28 V124" />
              <path d="M62,22 V130" />
              <path d="M78,22 V130" />
              <path d="M94,28 V124" />
            </g>
          ) : null}
          <path d="M34,30 V116" stroke={RED} strokeWidth={full ? 2 : 4} opacity="0.7" />
          <text
            x="76"
            y="86"
            textAnchor="middle"
            fontFamily="inherit"
            fontSize={full ? 44 : 60}
            fontWeight="700"
            fill={INK}
          >
            Ô
          </text>
        </g>
      );
    case "good":
      return (
        <g>
          <Pencil rotate={-40} body="#f7c948" />
          <Pencil rotate={40} body="#1e4fd8" />
          {full ? (
            <path
              d="M50,112 L60,100 L70,106 L80,100 L90,112 L80,116 L70,110 L60,116 Z"
              fill="#7cf5c5"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ) : null}
        </g>
      );
    case "honor":
      return (
        <g>
          <g transform="rotate(-10 70 66)">
            <circle cx="70" cy="66" r="30" fill={PAPER} stroke={RED} strokeWidth={full ? 4 : 7} />
            {full ? (
              <circle
                cx="70"
                cy="66"
                r="23"
                fill="none"
                stroke={RED}
                strokeWidth="2"
                strokeDasharray="20 4 30 5"
              />
            ) : null}
            <text
              x="70"
              y="78"
              textAnchor="middle"
              fontFamily="inherit"
              fontSize="34"
              fontWeight="700"
              fill={RED}
            >
              10
            </text>
          </g>
          {full ? (
            <g>
              <path
                d="M30,104 L50,98 L70,104 L90,98 L110,104 L106,116 L70,110 L34,116 Z"
                fill={RED}
                stroke={INK}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <text
                x="70"
                y="112"
                textAnchor="middle"
                fontFamily="inherit"
                fontSize="11"
                fill={PAPER}
              >
                GIỎI
              </text>
            </g>
          ) : null}
        </g>
      );
    case "valedictorian":
      return (
        <g>
          <polygon points="70,2 112,18 70,34 28,18" fill={INK} stroke={INK} strokeWidth="3" />
          {full ? (
            <g>
              <path d="M48,26 V40 C48,48 92,48 92,40 V26" fill={INK} />
              <path d="M112,18 V36" stroke={SUN} strokeWidth="3" strokeLinecap="round" />
              <circle cx="112" cy="38" r="3.5" fill={SUN} stroke={INK} strokeWidth="1.5" />
            </g>
          ) : null}
          <polygon
            points={
              full ? STAR_BIG : "70,50 82,78 110,78 88,95 96,122 70,106 44,122 52,95 30,78 58,78"
            }
            fill={SUN}
            stroke={INK}
            strokeWidth={full ? 3 : 4}
            strokeLinejoin="round"
          />
        </g>
      );
    case "topscholar":
      return (
        <g>
          <rect
            x="52"
            y="14"
            width="36"
            height="22"
            rx="8"
            fill={INK}
            stroke={SUN}
            strokeWidth="2.5"
          />
          <path
            d="M52,24 C40,20 30,22 24,26 C32,30 42,30 52,28 Z"
            fill={INK}
            stroke={SUN}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M88,24 C100,20 110,22 116,26 C108,30 98,30 88,28 Z"
            fill={INK}
            stroke={SUN}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <polygon
            points="70,46 81,72 109,72 86,88 95,114 70,98 45,114 54,88 31,72 59,72"
            fill={SUN}
            stroke={INK}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {full ? (
            <g>
              <text
                x="70"
                y="92"
                textAnchor="middle"
                fontFamily="inherit"
                fontSize="22"
                fontWeight="700"
                fill={INK}
              >
                Ô
              </text>
              <g fill="#fff6c2">
                <polygon points="20,18 22,23 27,24 22,26 20,31 18,26 13,24 18,23" />
                <polygon points="124,12 125.5,16 130,17 125.5,18.5 124,23 122.5,18.5 118,17 122.5,16" />
                <polygon points="128,120 129.5,124 134,125 129.5,126.5 128,131 126.5,126.5 122,125 126.5,124" />
              </g>
            </g>
          ) : null}
        </g>
      );
    default:
      return null;
  }
}

function Pencil({ rotate, body }: { rotate: number; body: string }) {
  return (
    <g transform={`rotate(${rotate} 70 76)`}>
      <rect
        x="30"
        y="70"
        width="70"
        height="12"
        rx="2"
        fill={body}
        stroke={INK}
        strokeWidth="2.5"
      />
      <polygon
        points="100,70 114,76 100,82"
        fill="#e8c9a0"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <polygon points="109,73.5 114,76 109,78.5" fill={INK} />
      <rect x="30" y="70" width="8" height="12" fill="#ff6fbc" stroke={INK} strokeWidth="2.5" />
    </g>
  );
}

/** Dưới khiên: sao bậc con (III = 1 sao … I = 3 sao) hoặc #thứ hạng cho hai bậc đỉnh. */
function Foot({
  tier,
  division,
  position,
}: {
  tier: Tier | null;
  division: number | null;
  position: number | null;
}) {
  if (tier === "valedictorian" || tier === "topscholar") {
    if (!position) return null;
    return (
      <text
        x="70"
        y="147"
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="15"
        fontWeight="700"
        fill={INK}
      >
        #{position}
      </text>
    );
  }
  if (tier === null || !division) return null;
  const n = 4 - division; // III → 1, II → 2, I → 3
  const xs = n === 1 ? [70] : n === 2 ? [61, 79] : [52, 70, 88];
  return (
    <g fill={INK}>
      {xs.map((x) => (
        <polygon
          key={x}
          points={STAR_SM}
          transform={`translate(${x} 142)${x === 70 && n === 3 ? " scale(1.15)" : ""}`}
        />
      ))}
    </g>
  );
}
