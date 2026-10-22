"use client";

import { Box } from "@chakra-ui/react";
import { useLocale } from "next-intl";
import {
  assetUrl,
  type BoxSkin,
  type PenForm,
  type PenSkin,
  type SkinManifest,
} from "@/game/skins/skins";

// Xem trước tĩnh bằng SVG cho thẻ shop (nhẹ, không cần PixiJS): bút và ô đều hiện cả hai hình thái
// (mình / đối thủ) — bút theo kiểu nét, ô theo hiệu ứng với màu hình thái của bút mặc định. Bản "thật" chạy trong TryDialog (BoardCanvas).
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

/** Mẫu ô đã ăn: hai hình thái cạnh nhau (màu hình thái của bút mặc định: mình xanh, đối thủ đỏ). */
function BoxSample({ box, size }: { box: BoxSkin; size: number }) {
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
      {[BLUE, RED].map((color, k) => (
        <g key={k} transform={`translate(${k * half + half / 2} ${size * 0.44})`}>
          <BoxShape
            box={box}
            color={color}
            s={half * 0.6}
            uid={`${box.id}-${k}`}
            tilt={k ? 6 : -6}
          />
          <text
            y={size * 0.56 - 9}
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

/** Đa giác tròn méo (SVG) quanh gốc: `base(θ)` bán kính, méo tất định theo chỉ số điểm. */
function wobblyPoints(n: number, base: (a: number) => number, amp: number, seed: number): string {
  const pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = base(a) * (1 + (hash01(seed * 5 + k) - 0.5) * amp);
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(" ");
}

function heartD(w: number): string {
  return `M0,${w * 0.75} C${-w * 1.35},${-w * 0.1} ${-w * 0.6},${-w * 1.05} 0,${-w * 0.4} C${w * 0.6},${-w * 1.05} ${w * 1.35},${-w * 0.1} 0,${w * 0.75} Z`;
}

/** Hình ô (cạnh `s`, gốc = tâm ô) theo hiệu ứng, kèm khung 4 cạnh + chấm góc để giống bàn thật. */
function BoxShape({
  box,
  color,
  s,
  uid,
  tilt,
}: {
  box: BoxSkin;
  color: string;
  s: number;
  uid: string;
  tilt: number;
}) {
  const h = s / 2;
  const { effect, alpha } = box.box;
  const thin = 1.8;
  // Ba nét gạch chéo offset −h/2, 0, +h/2 (dir 1 xuôi, −1 ngược) — khớp engine.
  const hatch = (dir: 1 | -1) =>
    [-h / 2, 0, h / 2].map((o, k) => {
      const c = o * 2;
      const a = c >= 0 ? { x: c - h, y: h } : { x: -h, y: c + h };
      const b = c >= 0 ? { x: h, y: c - h } : { x: c + h, y: -h };
      return <line key={`${dir}${k}`} x1={a.x * dir} y1={a.y} x2={b.x * dir} y2={b.y} />;
    });
  // Ảnh của gói skin (ADR-0014): nhuộm màu qua mask độ sáng (ảnh trắng trên nền trong suốt).
  const imageUrl = effect === "image" ? assetUrl(box, box.box.image) : null;
  let inner: React.ReactNode;
  switch (effect === "image" && !imageUrl ? "hatch" : effect) {
    case "image": {
      const d = s * (box.box.scale ?? 0.9);
      const img = <image href={imageUrl ?? ""} x={-d / 2} y={-d / 2} width={d} height={d} />;
      inner = (
        <g transform={`rotate(${tilt})`} opacity={alpha}>
          {box.box.tint === false ? (
            img
          ) : (
            <>
              <mask
                id={`m-${uid}`}
                maskUnits="userSpaceOnUse"
                x={-d}
                y={-d}
                width={d * 2}
                height={d * 2}
              >
                {img}
              </mask>
              <rect
                x={-d / 2}
                y={-d / 2}
                width={d}
                height={d}
                fill={color}
                mask={`url(#m-${uid})`}
              />
            </>
          )}
        </g>
      );
      break;
    }
    case "fill": {
      const j = (k: number) => (hash01(uid.length * 13 + k) - 0.5) * s * 0.08;
      inner = (
        <>
          <polygon
            points={`${-h + j(1)},${-h + j(2)} ${h + j(3)},${-h + j(4)} ${h + j(5)},${h + j(6)} ${-h + j(7)},${h + j(8)}`}
            fill={color}
            opacity={alpha}
          />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x={k % 2 === 0 ? h - s * 0.14 : -h - s * 0.1}
              y={-h + s * (0.18 + 0.3 * k)}
              width={s * 0.24}
              height={s * 0.1}
              fill={color}
              opacity={alpha * 0.7}
            />
          ))}
        </>
      );
      break;
    }
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
                r={s * 0.09 * (i === 1 && j === 1 ? 1.35 : 1)}
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
      let last = { x: 0, y: 0 };
      for (let i = 0; i < 9; i++) {
        last = { x: (rnd() * 2 - 1) * h * 0.85, y: (rnd() * 2 - 1) * h * 0.85 };
        pts.push(`${last.x.toFixed(2)},${last.y.toFixed(2)}`);
      }
      inner = (
        <>
          <polyline
            points={pts.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={thin * 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={alpha}
          />
          <circle cx={last.x} cy={last.y} r={thin * 1.2} fill={color} opacity={0.9} />
        </>
      );
      break;
    }
    case "star":
      inner = (
        <>
          <polygon
            points={starPoints(h * 1.05, h * 0.47)}
            fill={color}
            opacity={alpha}
            stroke={color}
            strokeWidth={thin}
          />
          <g stroke={SUN} strokeWidth={thin * 1.3} strokeLinecap="round">
            {[-1, 1].flatMap((sx) =>
              [-1, 1].map((sy) => (
                <line
                  key={`${sx}${sy}`}
                  x1={sx * h * 0.75}
                  y1={sy * h * 0.75}
                  x2={sx * h * 1.1}
                  y2={sy * h * 1.1}
                />
              )),
            )}
          </g>
        </>
      );
      break;
    case "stamp":
      inner = (
        <>
          <circle r={h * 0.86} fill={color} opacity={0.12} />
          <g transform={`rotate(${tilt})`}>
            <circle
              r={h * 0.78}
              fill="none"
              stroke={color}
              strokeWidth={thin * 2}
              strokeDasharray={`${h * 0.9} ${h * 0.25} ${h * 1.6} ${h * 0.2}`}
              strokeLinecap="round"
              opacity={0.85}
            />
            <circle r={h * 0.62} fill="none" stroke={color} strokeWidth={thin} opacity={0.6} />
            <text
              y={s * 0.18}
              textAnchor="middle"
              fontWeight="700"
              fontSize={s * 0.5}
              fill={color}
              opacity={0.9}
            >
              10
            </text>
          </g>
        </>
      );
      break;
    case "heart": {
      const w = h * 0.95;
      inner = (
        <>
          <path
            d={heartD(w)}
            fill={color}
            opacity={alpha + 0.25}
            stroke={color}
            strokeWidth={thin}
          />
          <ellipse
            cx={-w * 0.5}
            cy={-w * 0.5}
            rx={w * 0.2}
            ry={w * 0.1}
            transform={`rotate(-40 ${-w * 0.5} ${-w * 0.5})`}
            fill={PAPER}
            opacity={0.75}
          />
          {[-0.5, 0.3].map((dx, k) => (
            <path
              key={k}
              d={heartD(h * 0.2)}
              transform={`translate(${dx * h} ${-h * 1.05 - k * h * 0.25})`}
              fill={color}
              opacity={0.6 - k * 0.2}
            />
          ))}
        </>
      );
      break;
    }
    case "seal":
      inner = (
        <>
          <polygon
            points={wobblyPoints(14, () => h * 0.86, 0.14, uid.length)}
            fill={SUN}
            stroke={INK}
            strokeWidth={thin * 1.4}
            strokeLinejoin="round"
          />
          <polygon points={starPoints(h * 0.55, h * 0.26)} fill={color} />
          <ellipse
            rx={h * 0.14}
            ry={h * 0.75}
            transform={`translate(${-h * 0.35} 0) rotate(25)`}
            fill="#ffffff"
            opacity={0.5}
          />
        </>
      );
      break;
    case "flower":
      inner = (
        <>
          {[0, 1, 2, 3, 4].map((k) => (
            <ellipse
              key={k}
              cy={-h * 0.5}
              rx={h * 0.24}
              ry={h * 0.4}
              transform={`rotate(${k * 72})`}
              fill={color}
              opacity={alpha}
              stroke={INK}
              strokeWidth={thin * 0.7}
              strokeOpacity={0.5}
            />
          ))}
          <circle r={h * 0.28} fill={SUN} stroke={INK} strokeWidth={thin} />
        </>
      );
      break;
    case "flame":
      inner = (
        <>
          <polygon
            points={wobblyPoints(
              20,
              (a) => h / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))),
              0.1,
              uid.length,
            )}
            fill={color}
            opacity={alpha}
            stroke={INK}
            strokeWidth={thin}
            strokeOpacity={0.5}
            strokeLinejoin="round"
          />
          <circle cx={-h * 0.4} cy={h * 0.3} r={h * 0.09} fill="#ffd166" />
          <circle cx={h * 0.35} cy={-h * 0.2} r={h * 0.08} fill="#ffd166" opacity={0.8} />
          <path
            d={`M${h * 0.05},${-h * 0.2} C${h * 0.45},${-h * 0.55} ${h * 0.25},${-h * 0.95} ${h * 0.05},${-h * 1.15} C${-h * 0.15},${-h * 0.95} ${-h * 0.35},${-h * 0.55} ${h * 0.05},${-h * 0.2}`}
            fill="#ffd166"
            opacity={0.9}
          />
          <circle cx={h * 0.1} cy={-h * 1.3} r={h * 0.12} fill="#8a8a8a" opacity={0.25} />
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
  const o = s / 2 + 5;
  return (
    <g>
      <rect
        x={-o}
        y={-o}
        width={o * 2}
        height={o * 2}
        stroke={INK}
        strokeWidth="2"
        fill="none"
        opacity={0.25}
      />
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
