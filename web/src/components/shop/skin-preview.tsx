"use client";

import { Box } from "@chakra-ui/react";
import type { BoxSkin, PenSkin, SkinManifest } from "@/game/skins/skins";

// Xem trước tĩnh bằng SVG cho thẻ shop (nhẹ, không cần PixiJS): nét bút theo tham số skin,
// ô đã ăn theo hiệu ứng. Bản "thật" chạy trong TryDialog (BoardCanvas).
const INK = "#1a2826";
const PAPER = "#fffcf2";
const BLUE = "#1e4fd8";
const RED = "#d8341e";
const SUN = "#ffd93d";
const RAINBOW = ["#ff5f5f", "#ffa64d", "#ffe14d", "#6ee77a", "#4fc3ff", "#8a7bff", "#ff7bd6"];

export function SkinPreview({ skin, size = 120 }: { skin: SkinManifest; size?: number }) {
  return (
    <Box
      w="full"
      aspectRatio="1"
      bg={PAPER}
      border="2px solid"
      borderColor="ink"
      borderRadius="lg"
      overflow="hidden"
      backgroundImage="linear-gradient(rgba(201,216,240,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(201,216,240,.6) 1px, transparent 1px)"
      backgroundSize="12px 12px"
    >
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" aria-hidden="true">
        {skin.type === "pen" ? (
          <PenSample pen={skin} size={size} />
        ) : (
          <BoxSample box={skin} size={size} />
        )}
      </svg>
    </Box>
  );
}

function wobble(x0: number, y0: number, x1: number, y1: number, jitter: number, seed: number) {
  const pts: string[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const h = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const j = (h - Math.floor(h) - 0.5) * 2 * jitter * 3 * Math.sin(Math.PI * t);
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const len = Math.hypot(nx, ny) || 1;
    pts.push(`${x0 + (x1 - x0) * t + (nx / len) * j},${y0 + (y1 - y0) * t + (ny / len) * j}`);
  }
  return pts.join(" ");
}

function PenSample({ pen, size }: { pen: PenSkin; size: number }) {
  const p = pen.pen;
  const w = 5 * p.width;
  const lines: [number, number, number, number, string][] = [
    [18, 30, 102, 30, BLUE],
    [18, 30, 18, 90, BLUE],
    [60, 30, 60, 90, RED],
    [18, 90, 102, 90, RED],
    [102, 30, 102, 90, BLUE],
  ];
  const cap = p.cap ?? "round";
  const dash = p.dash ? `${p.dash[0] * 42} ${p.dash[1] * 42}` : undefined;
  return (
    <g fill="none" strokeLinecap={cap} strokeLinejoin="round" opacity={p.alpha ?? 1}>
      {lines.map(([x0, y0, x1, y1, c], i) => {
        const color = p.hue === "rainbow" ? RAINBOW[i % RAINBOW.length] : c;
        const pts = wobble(x0, y0, x1, y1, p.jitter ?? 1, i + 1);
        return (
          <g key={i}>
            {p.glow ? (
              <polyline points={pts} stroke={p.glow} strokeWidth={w * 2.6} opacity={0.35} />
            ) : null}
            <polyline points={pts} stroke={color} strokeWidth={w} strokeDasharray={dash} />
            {p.taper ? (
              <polyline points={pts} stroke={color} strokeWidth={w * 0.45} opacity={0.6} />
            ) : null}
          </g>
        );
      })}
      {/* Chữ COMBO nhỏ gợi kiểu hiệu ứng */}
      <text
        x={size / 2}
        y={size - 12}
        textAnchor="middle"
        fontFamily="inherit"
        fontWeight="700"
        fontSize="16"
        fill={
          pen.combo.style === "ink"
            ? BLUE
            : pen.combo.style === "chalk"
              ? "#ffffff"
              : pen.combo.style === "neon"
                ? (p.glow ?? SUN)
                : SUN
        }
        stroke={pen.combo.style === "ink" ? PAPER : INK}
        strokeWidth="1.5"
        paintOrder="stroke"
      >
        COMBO ×3
      </text>
    </g>
  );
}

function BoxSample({ box, size }: { box: BoxSkin; size: number }) {
  const s = size * 0.56;
  const h = s / 2;
  const cx = size / 2;
  const cy = size / 2;
  const { effect, alpha } = box.box;
  const color = BLUE;
  const thin = 2.2;
  const hatch = (dir: 1 | -1) => {
    const out: React.ReactNode[] = [];
    const step = s / 4;
    for (let i = -s; i < s; i += step) {
      const x0 = Math.max(-h, i);
      const x1 = Math.min(h, i + s);
      const y0 = dir === 1 ? Math.max(-h, -i - s) : -Math.max(-h, -i - s);
      const y1 = dir === 1 ? Math.min(h, -i) : -Math.min(h, -i);
      out.push(<line key={`${dir}${i}`} x1={x0} y1={y0} x2={x1} y2={y1} />);
    }
    return out;
  };
  let inner: React.ReactNode;
  switch (effect) {
    case "fill":
      inner = (
        <rect x={-h} y={-h} width={s} height={s} rx={s * 0.12} fill={color} opacity={alpha} />
      );
      break;
    case "crosshatch":
      inner = (
        <>
          <rect x={-h} y={-h} width={s} height={s} rx={s * 0.12} fill={color} opacity={alpha} />
          <g stroke={color} strokeWidth={thin} opacity={0.55} strokeLinecap="round">
            {hatch(1)}
            {hatch(-1)}
          </g>
        </>
      );
      break;
    case "dots":
      inner = (
        <>
          <rect
            x={-h}
            y={-h}
            width={s}
            height={s}
            rx={s * 0.12}
            fill={color}
            opacity={alpha * 0.5}
          />
          {[0, 1, 2].flatMap((i) =>
            [0, 1, 2].map((j) => (
              <circle
                key={`${i}${j}`}
                cx={-h + s * (0.2 + i * 0.3)}
                cy={-h + s * (0.2 + j * 0.3)}
                r={s * 0.09}
                fill={color}
                opacity={0.7}
              />
            )),
          )}
        </>
      );
      break;
    case "scribble": {
      let seed = 97;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const pts = [`${-h * 0.8},${-h * 0.7}`];
      for (let i = 0; i < 9; i++)
        pts.push(`${(rnd() * 2 - 1) * h * 0.85},${(rnd() * 2 - 1) * h * 0.85}`);
      inner = (
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={thin * 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />
      );
      break;
    }
    case "star":
      inner = (
        <polygon
          points={starPoints(h * 0.9, h * 0.42)}
          fill={color}
          opacity={alpha + 0.3}
          stroke={color}
          strokeWidth={thin}
        />
      );
      break;
    case "stamp":
      inner = (
        <g transform="rotate(-8)">
          <circle r={h * 0.78} fill="none" stroke={RED} strokeWidth={thin * 2} opacity={0.85} />
          <circle r={h * 0.62} fill="none" stroke={RED} strokeWidth={thin} opacity={0.6} />
          <text
            y={s * 0.18}
            textAnchor="middle"
            fontWeight="700"
            fontSize={s * 0.5}
            fill={RED}
            opacity={0.9}
          >
            10
          </text>
        </g>
      );
      break;
    case "heart": {
      const w = h * 0.95;
      inner = (
        <path
          d={`M0,${w * 0.75} C${-w * 1.35},${-w * 0.1} ${-w * 0.6},${-w * 1.05} 0,${-w * 0.4} C${w * 0.6},${-w * 1.05} ${w * 1.35},${-w * 0.1} 0,${w * 0.75} Z`}
          fill={RED}
          opacity={alpha + 0.25}
          stroke={RED}
          strokeWidth={thin}
        />
      );
      break;
    }
    case "seal":
      inner = (
        <>
          <circle r={h * 0.86} fill={SUN} stroke={INK} strokeWidth={thin * 1.4} />
          <polygon points={starPoints(h * 0.55, h * 0.26)} fill={color} />
        </>
      );
      break;
    case "hatch":
    default:
      inner = (
        <>
          <rect x={-h} y={-h} width={s} height={s} rx={s * 0.12} fill={color} opacity={alpha} />
          <g stroke={color} strokeWidth={thin} opacity={0.55} strokeLinecap="round">
            {hatch(1)}
          </g>
        </>
      );
  }
  // Bốn cạnh khép ô + chấm góc để giống bàn thật.
  const o = s / 2 + 6;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g stroke={INK} strokeWidth="2" fill="none" opacity={0.25}>
        <rect x={-o} y={-o} width={o * 2} height={o * 2} />
      </g>
      {[-o, o].flatMap((x) =>
        [-o, o].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="3" fill={INK} />),
      )}
      {inner}
    </g>
  );
}

function starPoints(outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${Math.cos(a) * r},${Math.sin(a) * r}`);
  }
  return pts.join(" ");
}
