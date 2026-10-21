"use client";

import { Box } from "@chakra-ui/react";
import { useLocale } from "next-intl";
import type { BoxSkin, PenForm, PenSkin, SkinManifest } from "@/game/skins/skins";

// Xem trước tĩnh bằng SVG cho thẻ shop (nhẹ, không cần PixiJS): bút hiện cả hai hình thái
// (mình / đối thủ) theo kiểu nét, ô đã ăn theo hiệu ứng. Bản "thật" chạy trong TryDialog (BoardCanvas).
const INK = "#1a2826";
const PAPER = "#fffcf2";
const BLUE = "#1e4fd8";
const RED = "#d8341e";
const SUN = "#ffd93d";

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

/** Hash tất định 0–1 chỉ bằng số nguyên — `Math.sin` số lớn lệch ulp giữa Node (SSR) và trình duyệt. */
function hash01(seed: number): number {
  let h = (seed * 374761393 + 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function wobble(x0: number, y0: number, x1: number, y1: number, jitter: number, seed: number) {
  const pts: string[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = (hash01(seed * 131 + i) - 0.5) * 2 * jitter * 3 * Math.sin(Math.PI * t);
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const len = Math.hypot(nx, ny) || 1;
    // Làm tròn 2 chữ số để chuỗi `points` SSR và client khớp nhau tuyệt đối (hydration).
    const px = (x0 + (x1 - x0) * t + (nx / len) * j).toFixed(2);
    const py = (y0 + (y1 - y0) * t + (ny / len) * j).toFixed(2);
    pts.push(`${px},${py}`);
  }
  return pts.join(" ");
}

/**
 * Mẫu bút: hai hình thái cạnh nhau trong một ô xem trước — nửa trái "Mình" (tông lạnh), nửa phải
 * "Đối thủ" (tông nóng). Mỗi kiểu bút (pen.style) được xấp xỉ bằng SVG: gradient (linearGradient),
 * quầng neon (blur), lửa (path ngọn lửa nhỏ), cầu vồng / kim loại (gradient nhiều mốc).
 */
function PenSample({ pen, size }: { pen: PenSkin; size: number }) {
  const locale = useLocale();
  const labels = locale === "en" ? ["You", "Rival"] : ["Mình", "Đối thủ"];
  const half = size / 2;
  return (
    <>
      <line
        x1={half}
        y1={10}
        x2={half}
        y2={size - 10}
        stroke={INK}
        strokeWidth="1.5"
        strokeDasharray="3 4"
        opacity={0.35}
      />
      {(["mine", "opponent"] as const).map((side, k) => (
        <g key={side} transform={`translate(${k * half} 0)`}>
          <FormSample pen={pen} form={pen.forms[side]} half={half} uid={`${pen.id}-${side}`} />
          <text
            x={half / 2}
            y={size - 9}
            textAnchor="middle"
            fontFamily="inherit"
            fontWeight="700"
            fontSize="11"
            fill={INK}
            opacity={0.75}
          >
            {labels[k]}
          </text>
        </g>
      ))}
    </>
  );
}

/** Một hình thái trong nửa ô (rộng `half`): ba nét hình chữ C + hiệu ứng theo kiểu bút. */
function FormSample({
  pen,
  form,
  half,
  uid,
}: {
  pen: PenSkin;
  form: PenForm;
  half: number;
  uid: string;
}) {
  const p = pen.pen;
  const style = p.style;
  const w = 4.2 * p.width;
  const x0 = half * 0.22;
  const x1 = half * 0.82;
  const y0 = 30;
  const y1 = 78;
  const lines: [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x0, y0, x0, y1],
    [x0, y1, x1, y1],
  ];
  const cap = p.cap ?? "round";
  const dash = p.dash ? `${p.dash[0] * 36} ${p.dash[1] * 36}` : undefined;
  const color2 = form.color2 ?? form.color;
  const core = form.core ?? color2;
  const glow = form.glow ?? form.color;
  const graded =
    style === "gradient" || style === "brush" || style === "rainbow" || style === "metal";
  const stops =
    style === "rainbow" || style === "metal"
      ? (form.colors ?? [form.color, color2])
      : [form.color, color2];
  const gradId = `g-${uid}`;
  const glowId = `b-${uid}`;
  const mainStroke = graded ? `url(#${gradId})` : form.color;
  return (
    <g fill="none" strokeLinecap={cap} strokeLinejoin="round">
      <defs>
        {graded ? (
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={x0}
            y1={y0}
            x2={x1}
            y2={y1}
          >
            {stops.map((c, i) => (
              <stop
                key={i}
                offset={`${(i / Math.max(1, stops.length - 1)) * 100}%`}
                stopColor={c}
              />
            ))}
          </linearGradient>
        ) : null}
        {style === "neon" ? (
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        ) : null}
      </defs>
      {lines.map(([ax, ay, bx, by], i) => {
        const pts = wobble(ax, ay, bx, by, p.jitter ?? 1, i + 1);
        return (
          <g key={i}>
            {/* Lớp dưới: quầng / halo / viền đậm */}
            {style === "neon" ? (
              <polyline
                points={pts}
                stroke={glow}
                strokeWidth={w * 2.6}
                opacity={0.4}
                filter={`url(#${glowId})`}
              />
            ) : null}
            {style === "metal" ? (
              <polyline points={pts} stroke={glow} strokeWidth={w * 2} opacity={0.3} />
            ) : null}
            {style === "fire" ? (
              <polyline points={pts} stroke={form.color} strokeWidth={w * 2.2} opacity={0.22} />
            ) : null}
            {style === "twotone" ? (
              <polyline points={pts} stroke={color2} strokeWidth={w * 1.6} opacity={0.55} />
            ) : null}
            {style === "brush" ? (
              <polyline points={pts} stroke={color2} strokeWidth={w * 2.2} opacity={0.22} />
            ) : null}
            {style === "gradient" && p.halo ? (
              <polyline points={pts} stroke={color2} strokeWidth={w * 2.4} opacity={0.18} />
            ) : null}
            {/* Lớp chính */}
            <polyline
              points={pts}
              stroke={mainStroke}
              strokeWidth={w}
              strokeDasharray={dash}
              opacity={p.alpha ?? 1}
            />
            {p.taper || style === "brush" ? (
              <polyline
                points={pts}
                stroke={mainStroke}
                strokeWidth={w * (style === "brush" ? 0.5 : 0.45)}
                opacity={0.6}
              />
            ) : null}
            {/* Lớp trên: lõi sáng, hạt chì, chấm sáp, ánh kim */}
            {style === "neon" || style === "fire" ? (
              <polyline points={pts} stroke={core} strokeWidth={w * 0.38} opacity={0.9} />
            ) : null}
            {p.grain === "graphite" ? (
              <polyline
                points={wobble(ax + 1.2, ay + 1.2, bx + 1.2, by + 1.2, p.jitter ?? 1, i + 1)}
                stroke={color2}
                strokeWidth={w * 0.3}
                opacity={0.5}
              />
            ) : null}
            {p.grain === "wax"
              ? [0.2, 0.45, 0.7, 0.9].map((t, k) => (
                  <circle
                    key={k}
                    cx={ax + (bx - ax) * t + (k % 2 ? 1.5 : -1.5)}
                    cy={ay + (by - ay) * t + (k % 2 ? -1.5 : 1.5)}
                    r={w * 0.17}
                    fill={form.accent ?? color2}
                    opacity={0.65}
                  />
                ))
              : null}
          </g>
        );
      })}
      {style === "metal" ? (
        <line
          x1={x0 + 10}
          y1={y0}
          x2={x0 + 24}
          y2={y0}
          stroke="#ffffff"
          strokeWidth={w * 0.55}
          opacity={0.85}
        />
      ) : null}
      {style === "fire"
        ? [0.3, 0.55, 0.8].map((t, k) => {
            const fx = x0 + (x1 - x0) * t;
            const fy = y0 - 2;
            const h = 9 + (k % 2) * 4;
            return (
              <path
                key={k}
                d={`M${fx},${fy} C${fx + 4},${fy - h * 0.4} ${fx + 2},${fy - h * 0.8} ${fx},${fy - h} C${fx - 2},${fy - h * 0.8} ${fx - 4},${fy - h * 0.4} ${fx},${fy}`}
                fill={k === 1 ? form.color : color2}
                opacity={0.85}
              />
            );
          })
        : null}
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
