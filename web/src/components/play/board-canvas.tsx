"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { GameSession } from "@/game/controller";
import type { BoardRenderer, RendererEvent } from "@/game/renderer/board-renderer";
import type { SeatSkins } from "@/game/skins/skins";

type BoardCanvasProps = {
  session: GameSession;
  onSelectEdge: (edge: number) => void;
  /** Sự kiện hiệu ứng từ renderer (đếm ô, đã xong hiệu ứng kết thúc). */
  onEvent?: (event: RendererEvent) => void;
  /** Bàn 7×7 trên màn hình hẹp: chạm hai lần để xác nhận (docs/11). */
  twoTapTouch?: boolean;
  label: string;
  /** Chữ "COMBO ×n" đã dịch (P0-14: qua hàm t, engine không tự dịch). */
  comboLabel: (n: number) => string;
  /** Skin bút / ô theo ghế (ADR-0013); bỏ trống = mặc định. */
  skins?: SeatSkins;
};

// Mount BoardRenderer (PixiJS) đúng một lần cho mỗi lần mount; mọi cập nhật (ván, chế độ chạm)
// đi qua phương thức của renderer, không tạo lại renderer.
export function BoardCanvas({
  session,
  onSelectEdge,
  onEvent,
  twoTapTouch,
  label,
  comboLabel,
  skins,
}: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const onSelectRef = useRef(onSelectEdge);
  const onEventRef = useRef(onEvent);
  const comboLabelRef = useRef(comboLabel);

  useEffect(() => {
    onSelectRef.current = onSelectEdge;
    onEventRef.current = onEvent;
    comboLabelRef.current = comboLabel;
  }, [onSelectEdge, onEvent, comboLabel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let created: BoardRenderer | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("@/game/renderer/board-renderer").then(async ({ BoardRenderer }) => {
      if (cancelled) return;
      created = await BoardRenderer.create(host, {
        onSelectEdge: (edge) => onSelectRef.current(edge),
        onEvent: (e) => onEventRef.current?.(e),
        labels: { combo: (n) => comboLabelRef.current(n) },
        reducedMotion,
      });
      if (cancelled) {
        created.destroy();
        return;
      }
      setRenderer(created);
    });

    return () => {
      cancelled = true;
      created?.destroy();
      setRenderer(null);
    };
  }, []);

  useEffect(() => {
    renderer?.setTwoTapTouch(!!twoTapTouch);
  }, [renderer, twoTapTouch]);

  useEffect(() => {
    if (skins) renderer?.setSkins(skins);
  }, [renderer, skins]);

  useEffect(() => {
    renderer?.setSession(session);
  }, [renderer, session]);

  return (
    <Box
      ref={hostRef}
      w="full"
      aspectRatio="1"
      maxH="calc(100dvh - 220px)"
      mx="auto"
      css={{ touchAction: "none", "& canvas": { width: "100%", height: "100%" } }}
      aria-label={label}
      role="application"
    />
  );
}
