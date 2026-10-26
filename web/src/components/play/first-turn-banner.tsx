"use client";

import { Box, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { audio } from "@/game/audio/audio-manager";
import type { GameSession } from "@/game/controller";

/** Hiện bao lâu (ms). Server cộng thêm cho lượt đầu (room.OPENING_EXTRA_MS) nên không mất giờ. */
const SHOW_MS = 1800;

/**
 * Màn "Ai đi trước" lúc bắt đầu ván (docs/03 — Lượt đi đầu): lượt đầu bốc ngẫu nhiên ở mọi chế
 * độ, nên báo rõ cho người chơi. Hiện một lần mỗi ván (khoá theo phòng / số ván), khi ván đã sẵn
 * sàng chơi và chưa ai đi. Không chặn thao tác (pointer-events none).
 */
export function FirstTurnBanner({
  session,
  opponentName,
}: {
  session: GameSession;
  /** Tên đối thủ (online) — chơi với máy thì "Máy". */
  opponentName: string;
}) {
  const t = useTranslations("Play");
  const [show, setShow] = useState<{ key: string; mine: boolean } | null>(null);
  const shown = useRef<string | null>(null);
  const { state, result, human, online } = session;
  // round 0 = ván chơi với máy còn chờ bốc lượt đầu (LocalBotController) → chưa hiện.
  const ready =
    !result &&
    state.moveNo === 0 &&
    (session.round ?? 1) > 0 &&
    (!online || online.status === "playing");
  const key = `${online?.roomId ?? "local"}:${session.round ?? 0}`;
  const mine = state.turn === human;

  useEffect(() => {
    if (!ready || shown.current === key) return;
    shown.current = key;
    setShow({ key, mine });
    audio.play(mine ? "turn" : "ui_open", { volume: 0.6 });
  }, [ready, key, mine]);

  // Hẹn giờ ẩn tách riêng: người chơi đi nước đầu khi banner còn hiện (ready → false) không được
  // huỷ hẹn giờ này.
  const showKey = show?.key;
  useEffect(() => {
    if (!showKey) return;
    const id = setTimeout(() => setShow((s) => (s?.key === showKey ? null : s)), SHOW_MS);
    return () => clearTimeout(id);
  }, [showKey]);

  if (!show) return null;
  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={25}
      pointerEvents="none"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
      // Không đặt role="status": dòng trạng thái chính của màn chơi đã dùng role này.
      aria-live="assertive"
      data-testid="first-turn-banner"
      data-mine={show.mine}
    >
      <Stack
        layerStyle="sticker"
        bg={show.mine ? "pen.blue" : "pen.red"}
        color="paper"
        align="center"
        gap={1}
        px={{ base: 6, md: 10 }}
        py={{ base: 4, md: 6 }}
        textAlign="center"
        css={{
          animation: `okiaFirstTurn ${SHOW_MS}ms ease-out forwards`,
          "@keyframes okiaFirstTurn": {
            "0%": { transform: "scale(0.6) rotate(-4deg)", opacity: 0 },
            "12%": { transform: "scale(1.08) rotate(1deg)", opacity: 1 },
            "22%": { transform: "scale(1) rotate(0)", opacity: 1 },
            "85%": { transform: "scale(1)", opacity: 1 },
            "100%": { transform: "scale(0.94)", opacity: 0 },
          },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <Text fontFamily="hand" fontWeight="700" fontSize={{ base: "3xl", md: "4xl" }}>
          {show.mine ? t("firstYou") : t("firstThem", { name: opponentName })}
        </Text>
        <Text fontSize="sm" opacity={0.9}>
          {t("firstHint")}
        </Text>
      </Stack>
    </Box>
  );
}
