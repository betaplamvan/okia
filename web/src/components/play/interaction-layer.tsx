"use client";

import { Box, Portal } from "@chakra-ui/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SplatArt, ThrowIcon } from "@/components/play/throw-art";
import { audio } from "@/game/audio/audio-manager";
import { EMOTE_EMOJI, type InteractionSource } from "@/game/interactions";
import type { Player } from "@/game/rules";
import { assetUrl, throwOf } from "@/game/skins/skins";

/**
 * Lớp phủ tương tác trong trận (docs/08 — Đồ ném): bong bóng biểu cảm trên chip người gửi; đồ ném
 * bay từ chip người ném sang chip đối thủ (toạ độ đọc từ `[data-hud-seat]` của GameLayout) rồi
 * "trúng": hình bắn toé / nổ / cánh hoa… + rung chip + tiếng. Chỉ hình và tiếng, không chạm ván.
 * prefers-reduced-motion → bỏ đường bay, hiện thẳng hiệu ứng trúng.
 *
 * Lớp phủ render qua Portal vào `document.body` (2026-10-26): đặt trong hộp thoại (thử ném ở Shop)
 * thì `position: fixed` bị neo vào khung hộp thoại (có transform, overflow hidden) → lệch toạ độ.
 * Đường bay chạy bằng Web Animations API với toạ độ pixel cụ thể (keyframes CSS dùng biến không
 * chạy → món đồ đứng ở góc trên trái).
 */

const FLY_MS = 650;
/** Cỡ món đồ khi bay (px). */
const FLY_SIZE = 44;
const SPLAT_MS = 1400;
const EMOTE_MS = 2200;

type Fx =
  | { key: number; kind: "emote"; seat: Player; id: string; at: { x: number; y: number } }
  | {
      key: number;
      kind: "fly";
      seat: Player;
      id: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }
  | { key: number; kind: "splat"; seat: Player; id: string; at: { x: number; y: number } };

/** Lề tối thiểu so với mép màn hình (px) khi chip đã cuộn ra ngoài khung nhìn. */
const VIEW_MARGIN = 48;

/** Kẹp điểm vào trong khung nhìn: trang đã cuộn xuống (bấm nút ném dưới bàn trên điện thoại) thì
 *  chip ở ngoài màn hình — hiệu ứng vẫn phải thấy được, sát mép gần chip nhất. */
export function clampToView(p: { x: number; y: number }, margin = VIEW_MARGIN) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.min(w - margin, Math.max(margin, p.x)),
    y: Math.min(h - margin, Math.max(margin, p.y)),
  };
}

function chipCenter(seat: Player): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-hud-seat="${seat}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return clampToView({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

function chipTop(seat: Player): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-hud-seat="${seat}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Bong bóng nằm trên chip: chừa chỗ ~60 px phía trên để không bị cắt.
  return clampToView({ x: r.left + r.width / 2, y: r.top }, 64);
}

function shakeChip(seat: Player) {
  const el = document.querySelector<HTMLElement>(`[data-hud-seat="${seat}"]`);
  if (!el) return;
  el.classList.remove("okia-hit");
  // Reflow để animation chạy lại khi trúng liên tiếp.
  void el.offsetWidth;
  el.classList.add("okia-hit");
  setTimeout(() => el.classList.remove("okia-hit"), 500);
}

export function InteractionLayer({
  source,
}: {
  /** Controller (hoặc hộp thử) phát tương tác của cả hai ghế. */
  source: InteractionSource;
}) {
  const [fx, setFx] = useState<Fx[]>([]);
  const key = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const later = (ms: number, f: () => void) => {
      const id = window.setTimeout(f, ms);
      timers.current.push(id);
    };
    const remove = (k: number) => setFx((list) => list.filter((f) => f.key !== k));
    const unsub = source.subscribeInteractions((e) => {
      if (e.kind === "emote") {
        const at = chipTop(e.by);
        if (!at) return;
        const k = ++key.current;
        // Mỗi ghế một bong bóng: biểu cảm mới thay biểu cảm cũ.
        setFx((list) => [
          ...list.filter((f) => !(f.kind === "emote" && f.seat === e.by)),
          { key: k, kind: "emote", seat: e.by, id: e.id, at },
        ]);
        audio.play("ui_open", { volume: 0.35 });
        later(EMOTE_MS, () => remove(k));
        return;
      }
      const skin = throwOf(e.id);
      const target = (1 - e.by) as Player;
      const to = chipCenter(target);
      const from = chipCenter(e.by);
      if (!to) return;
      const sfx = skin.throw.sfx ?? {};
      const hitName = assetUrl(skin, sfx.hit) ?? sfx.hit ?? `hit_${skin.throw.splat}`;
      const throwName = assetUrl(skin, sfx.throw) ?? sfx.throw ?? "throw";
      const land = () => {
        const k = ++key.current;
        setFx((list) => [...list, { key: k, kind: "splat", seat: target, id: e.id, at: to }]);
        shakeChip(target);
        audio.play(hitName, { volume: 0.8 });
        if (typeof navigator !== "undefined" && navigator.vibrate)
          navigator.vibrate(skin.throw.splat === "explode" ? [30, 40, 60] : 25);
        later(SPLAT_MS, () => remove(k));
      };
      if (reduced || !from) {
        land();
        return;
      }
      const k = ++key.current;
      setFx((list) => [...list, { key: k, kind: "fly", seat: e.by, id: e.id, from, to }]);
      audio.play(throwName, { volume: 0.6 });
      later(FLY_MS, () => {
        remove(k);
        land();
      });
    });
    const saved = timers.current;
    return () => {
      unsub();
      for (const id of saved) clearTimeout(id);
      saved.length = 0;
    };
  }, [source]);

  return (
    <Portal>
      <Box
        position="fixed"
        inset={0}
        pointerEvents="none"
        // Trên cả hộp thoại (Dialog positioner z 1500 — thử ném ở Shop), dưới toast / quảng cáo xen.
        zIndex={1650}
        aria-hidden
        data-testid="interaction-layer"
      >
        {fx.map((f) => {
          if (f.kind === "emote")
            return <EmoteBubble key={f.key} seat={f.seat} id={f.id} at={f.at} />;
          const skin = throwOf(f.id);
          const c1 = skin.throw.color ?? "#ff6b6b";
          const c2 = skin.throw.color2 ?? "#ffd93d";
          if (f.kind === "fly")
            return (
              <FlyItem key={f.key} from={f.from} to={f.to} id={f.id}>
                <ThrowIcon
                  skin={skin}
                  size={FLY_SIZE}
                  imageUrl={assetUrl(skin, skin.throw.image)}
                />
              </FlyItem>
            );
          return (
            <Box
              key={f.key}
              position="absolute"
              left={`${f.at.x}px`}
              top={`${f.at.y}px`}
              css={{ animation: `okiaSplat ${SPLAT_MS}ms ease-out forwards` }}
              data-testid="throw-splat"
              data-item={f.id}
            >
              <SplatArt splat={skin.throw.splat} c1={c1} c2={c2} size={130} />
            </Box>
          );
        })}
      </Box>
    </Portal>
  );
}

/**
 * Món đồ bay từ `from` tới `to` theo vòng cung (đỉnh cao ~35 % quãng đường, tối thiểu 70 px),
 * xoay và phóng to ở giữa đường. Toạ độ là tâm món đồ theo viewport.
 */
function FlyItem({
  from,
  to,
  id,
  children,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  id: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    // Vòng cung lên trên, nhưng không vọt khỏi mép trên màn hình; sát mép (chip ở trên cùng khi
    // trang đã cuộn) thì võng xuống dưới.
    const room = Math.min(from.y, to.y) - FLY_SIZE / 2 - 8;
    const want = Math.max(70, dist * 0.35);
    const arc = room >= 60 ? Math.min(want, room) : -Math.min(want, 140);
    const half = FLY_SIZE / 2;
    const steps = 10;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t - half;
      const y = from.y + (to.y - from.y) * t - arc * 4 * t * (1 - t) - half;
      const scale = 0.6 + 0.55 * Math.sin(Math.PI * t) + 0.4 * t * t;
      frames.push({
        offset: t,
        transform: `translate(${x}px, ${y}px) rotate(${Math.round(420 * t)}deg) scale(${scale.toFixed(3)})`,
        opacity: t === 0 ? 0.9 : 1,
      });
    }
    const anim = el.animate(frames, { duration: FLY_MS, easing: "linear", fill: "forwards" });
    return () => anim.cancel();
  }, [from, to]);
  return (
    <Box
      ref={ref}
      position="absolute"
      left={0}
      top={0}
      w={`${FLY_SIZE}px`}
      h={`${FLY_SIZE}px`}
      // Vị trí ban đầu (trước khi animation chạy) = điểm xuất phát, không phải góc trên trái.
      style={{
        transform: `translate(${from.x - FLY_SIZE / 2}px, ${from.y - FLY_SIZE / 2}px) scale(0.6)`,
      }}
      willChange="transform"
      data-testid="throw-fly"
      data-item={id}
    >
      {children}
    </Box>
  );
}

function EmoteBubble({ seat, id, at }: { seat: Player; id: string; at: { x: number; y: number } }) {
  return (
    <Box
      position="absolute"
      left={`${at.x}px`}
      top={`${at.y - 8}px`}
      transform="translate(-50%, -100%)"
      bg="paper"
      border="3px solid"
      borderColor="ink"
      borderRadius="full"
      boxShadow="sticker"
      fontSize="28px"
      lineHeight="1"
      px={2}
      py={1}
      css={{ animation: `okiaEmote ${EMOTE_MS}ms ease-out forwards` }}
      data-testid="emote-bubble"
      data-emote={id}
      data-seat={seat}
    >
      {EMOTE_EMOJI[id as keyof typeof EMOTE_EMOJI] ?? id}
    </Box>
  );
}
