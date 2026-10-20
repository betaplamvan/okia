"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { GameSession } from "@/game/controller";
import type { BoardRenderer } from "@/game/renderer/board-renderer";

type BoardCanvasProps = {
  session: GameSession;
  onSelectEdge: (edge: number) => void;
  /** Bàn 7×7 trên màn hình hẹp: chạm hai lần để xác nhận (docs/11). */
  twoTapTouch?: boolean;
  label: string;
};

// Mount BoardRenderer (PixiJS) đúng một lần cho mỗi lần mount; mọi cập nhật (ván, chế độ chạm)
// đi qua phương thức của renderer, không tạo lại renderer.
export function BoardCanvas({ session, onSelectEdge, twoTapTouch, label }: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const onSelectRef = useRef(onSelectEdge);

  useEffect(() => {
    onSelectRef.current = onSelectEdge;
  }, [onSelectEdge]);

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
