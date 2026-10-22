// Trống Đồng Tri Ân (docs/10 — Donate): huy hiệu kỷ niệm cho người đã ủng hộ, vẽ bằng SVG theo
// mặt trống Đông Sơn: ngôi sao 12 cánh giữa, các vành hoa văn đồng tâm, màu đồng + viền mực.
export function BronzeDrum({ size = 64 }: { size?: number }) {
  const star = Array.from({ length: 24 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
    const r = i % 2 === 0 ? 16 : 7;
    return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 36;
    const x1 = 50 + Math.cos(a) * 30;
    const y1 = 50 + Math.sin(a) * 30;
    const x2 = 50 + Math.cos(a) * 35;
    const y2 = 50 + Math.sin(a) * 35;
    return (
      <line
        key={i}
        x1={x1.toFixed(2)}
        y1={y1.toFixed(2)}
        x2={x2.toFixed(2)}
        y2={y2.toFixed(2)}
        stroke="#6b4a12"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    );
  });
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id="okia-drum" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f3d27a" />
          <stop offset="0.55" stopColor="#d9a63a" />
          <stop offset="1" stopColor="#9c6b16" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#okia-drum)" stroke="#1a2826" strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#6b4a12" strokeWidth="1.5" />
      {ticks}
      <circle cx="50" cy="50" r="26" fill="none" stroke="#6b4a12" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#6b4a12" strokeWidth="1" opacity="0.7" />
      <polygon
        points={star}
        fill="#fff1b8"
        stroke="#6b4a12"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="3" fill="#6b4a12" />
      <path d="M22 78 Q50 92 78 78" fill="none" stroke="#1a2826" strokeWidth="2" opacity="0.35" />
    </svg>
  );
}
