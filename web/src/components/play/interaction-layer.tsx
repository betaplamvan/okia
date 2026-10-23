"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
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
 */

const FLY_MS = 650;
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

function chipCenter(seat: Player): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-hud-seat="${seat}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function chipTop(seat: Player): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-hud-seat="${seat}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top };
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
    <Box
      position="fixed"
      inset={0}
      pointerEvents="none"
      zIndex={30}
      aria-hidden
      css={{
        "@keyframes okiaFly": {
          "0%": { transform: "translate(-50%, -50%) scale(0.6) rotate(0deg)", opacity: 0.9 },
          "35%": { transform: "translate(-50%, calc(-50% - 60px)) scale(1.15) rotate(180deg)" },
          "100%": { transform: "translate(-50%, -50%) scale(1) rotate(420deg)", opacity: 1 },
        },
        "@keyframes okiaSplat": {
          "0%": { transform: "translate(-50%, -50%) scale(0.2)", opacity: 1 },
          "25%": { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1 },
          "70%": { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95 },
          "100%": { transform: "translate(-50%, -40%) scale(1.05)", opacity: 0 },
        },
        "@keyframes okiaEmote": {
          "0%": { transform: "translate(-50%, 0) scale(0.4)", opacity: 0 },
          "15%": { transform: "translate(-50%, -8px) scale(1.1)", opacity: 1 },
          "85%": { transform: "translate(-50%, -8px) scale(1)", opacity: 1 },
          "100%": { transform: "translate(-50%, -20px) scale(0.9)", opacity: 0 },
        },
        "@keyframes okiaHit": {
          "0%, 100%": { transform: "translate(0,0) rotate(0)" },
          "20%": { transform: "translate(-4px, 2px) rotate(-3deg)" },
          "40%": { transform: "translate(4px, -2px) rotate(3deg)" },
          "60%": { transform: "translate(-3px, 1px) rotate(-2deg)" },
          "80%": { transform: "translate(3px, -1px) rotate(2deg)" },
        },
      }}
      data-testid="interaction-layer"
    >
      {fx.map((f) => {
        if (f.kind === "emote")
          return <EmoteBubble key={f.key} seat={f.seat} id={f.id} at={f.at} />;
        const skin = throwOf(f.id);
        const c1 = skin.throw.color ?? "#ff6b6b";
        const c2 = skin.throw.color2 ?? "#ffd93d";
        if (f.kind === "fly") {
          // Bay theo đường cong: dịch chuyển theo biến CSS từ `from` tới `to` + nảy lên ở giữa.
          return (
            <Box
              key={f.key}
              position="absolute"
              left={0}
              top={0}
              style={{
                // @ts-expect-error biến CSS
                "--fx": `${f.from.x}px`,
                "--fy": `${f.from.y}px`,
                "--tx": `${f.to.x}px`,
                "--ty": `${f.to.y}px`,
              }}
              css={{
                animation: `okiaFlyPos ${FLY_MS}ms linear forwards`,
                "@keyframes okiaFlyPos": {
                  from: { left: "var(--fx)", top: "var(--fy)" },
                  to: { left: "var(--tx)", top: "var(--ty)" },
                },
              }}
              data-testid="throw-fly"
              data-item={f.id}
            >
              <Box css={{ animation: `okiaFly ${FLY_MS}ms ease-in forwards` }}>
                <ThrowIcon skin={skin} size={44} imageUrl={assetUrl(skin, skin.throw.image)} />
              </Box>
            </Box>
          );
        }
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
