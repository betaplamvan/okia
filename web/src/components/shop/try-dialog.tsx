"use client";

import { Button, CloseButton, Dialog, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { LuPencil, LuRotateCcw } from "react-icons/lu";
import { BoardCanvas } from "@/components/play/board-canvas";
import { useGameSounds } from "@/components/play/use-game-sounds";
import { audio } from "@/game/audio/audio-manager";
import { nextLastTurn, type GameSession } from "@/game/controller";
import { createGameForMap } from "@/game/maps";
import { applyMove, type Player } from "@/game/rules";
import { seatSkins, type SkinManifest } from "@/game/skins/skins";
import { useAuth } from "@/stores/auth";

// Kịch bản trên bàn 3×3 (24 cạnh): ghế 0 (bạn) ăn 2 ô liên tiếp ở nước 7–8 để thấy nét, ô ăn,
// tiếng và chữ COMBO. Cạnh đánh số theo rules.ts: ngang 0–11 (hàng r, cột c → r*3+c), dọc 12–23.
const SCRIPT: number[] = [0, 3, 12, 13, 1, 4, 14, 15, 2, 5, 16, 17, 6, 9];
// Ghế vẽ từng nước (ghế 0 ăn ô nên được đi tiếp): tính tự động bằng applyMove, chỉ liệt kê cạnh.

function fresh(): GameSession {
  return {
    mapId: "3x3",
    state: createGameForMap("3x3"),
    human: 0,
    bot: 1,
    lastMove: null,
    lastTurn: null,
    showLastMove: false,
    combo: 0,
    thinking: false,
    result: null,
  };
}

type Props = { skin: SkinManifest | null; onClose: () => void };

// Hộp thử skin (docs/06 — "Thử: xem skin trên bàn mẫu, chỉ ở client, không lưu"): bàn thật
// (BoardCanvas) với skin đang thử gắn vào ghế của bạn; bấm "Vẽ thử" đi từng nước theo kịch bản.
export function TryDialog({ skin, onClose }: Props) {
  const t = useTranslations("Shop");
  const locale = useLocale();
  const loadout = useAuth((s) => s.user?.loadout);
  const [session, setSession] = useState<GameSession>(fresh);
  const [step, setStep] = useState(0);

  const skins = useMemo(() => {
    const mine = { ...loadout, ...(skin ? { [skin.type]: skin.id } : {}) };
    return seatSkins(mine, null);
  }, [skin, loadout]);
  useGameSounds(session, skins);

  const draw = useCallback(() => {
    setSession((s) => {
      if (step >= SCRIPT.length || s.state.finished) return s;
      const by = s.state.turn as Player;
      const edge = SCRIPT[step];
      const res = applyMove(s.state, by, edge);
      if (!res.ok) return s;
      const sameTurnStreak = s.lastMove?.by === by && s.lastMove.captured.length > 0;
      const combo =
        res.captured.length > 0 ? (sameTurnStreak ? s.combo : 0) + res.captured.length : 0;
      return {
        ...s,
        state: res.state,
        lastMove: { edge, by, captured: res.captured },
        lastTurn: nextLastTurn(s.lastTurn, by, edge),
        combo,
      };
    });
    setStep((n) => n + 1);
  }, [step]);

  const reset = () => {
    audio.playUi("click");
    setSession(fresh());
    setStep(0);
  };

  const name = skin ? (locale === "en" ? skin.name.en : skin.name.vi) : "";
  return (
    <Dialog.Root placement="center" open={!!skin} onOpenChange={(e) => !e.open && onClose()}>
      <Portal>
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
        <Dialog.Positioner px={4}>
          <Dialog.Content layerStyle="sticker" p={0} overflow="hidden" maxW="sm">
            <Dialog.Header bg="sun" borderBottom="sticker">
              <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                {t("tryTitle", { name })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body color="ink" py={4} bg="board.base">
              <Stack gap={3}>
                <BoardCanvas
                  session={session}
                  onSelectEdge={() => false}
                  label={name}
                  comboLabel={(n) => `COMBO ×${n}`}
                  skins={skins}
                />
                <Text fontSize="sm" color="cream" textAlign="center">
                  {t("tryHint")}
                </Text>
                <HStack justify="center" gap={2}>
                  <Button
                    variant="sticker"
                    bg="mint"
                    onClick={draw}
                    disabled={step >= SCRIPT.length}
                    data-testid="try-draw"
                  >
                    <LuPencil /> {t("drawNext")}
                  </Button>
                  <Button variant="sticker" size="sm" onClick={reset}>
                    <LuRotateCcw /> {t("replay")}
                  </Button>
                </HStack>
              </Stack>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" color="ink" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
