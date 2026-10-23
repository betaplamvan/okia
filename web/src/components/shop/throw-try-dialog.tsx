"use client";

import { Box, Button, CloseButton, Dialog, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useMemo, useRef } from "react";
import { LuBot, LuUser } from "react-icons/lu";
import { InteractionLayer } from "@/components/play/interaction-layer";
import { PlayerChip } from "@/components/play/player-chip";
import { useSkinName } from "@/components/shop/skin-card";
import type { Interaction, InteractionSource } from "@/game/interactions";
import type { ThrowSkin } from "@/game/skins/skins";

/**
 * "Thử" đồ ném trong Shop (docs/08 — Đồ ném): hai chip giả (Bạn / Máy) + lớp phủ tương tác thật,
 * bấm "Ném thử" là món bay từ chip mình sang chip máy và bắn toé y như trong trận.
 */
export function ThrowTryDialog({ skin, onClose }: { skin: ThrowSkin | null; onClose: () => void }) {
  const t = useTranslations("Shop");
  const tp = useTranslations("Play");
  const skinName = useSkinName();
  const listeners = useRef(new Set<(e: Interaction) => void>());
  const source = useMemo<InteractionSource>(
    () => ({
      subscribeInteractions(cb) {
        listeners.current.add(cb);
        return () => {
          listeners.current.delete(cb);
        };
      },
    }),
    [],
  );
  const fire = () => {
    if (!skin) return;
    for (const l of listeners.current) l({ kind: "throw", by: 0, id: skin.id });
  };
  return (
    <Dialog.Root open={!!skin} onOpenChange={(e) => !e.open && onClose()} placement="center">
      <Portal>
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
        <Dialog.Positioner px={4}>
          <Dialog.Content layerStyle="sticker" p={0} overflow="hidden" maxW="md">
            <Dialog.Header bg="sun" borderBottom="sticker">
              <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                {skin ? t("tryTitle", { name: skinName(skin) }) : ""}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body color="ink" py={6}>
              <Stack gap={6} align="stretch">
                <HStack justify="space-between" px={2}>
                  <PlayerChip
                    hudSeat={0}
                    icon={<LuUser />}
                    name={tp("you")}
                    score="3"
                    tone="pen.blue"
                    active
                  />
                  <PlayerChip
                    hudSeat={1}
                    icon={<LuBot />}
                    name={tp("bot")}
                    score="1"
                    tone="pen.red"
                    active={false}
                    reverse
                  />
                </HStack>
                <Text fontSize="sm" opacity={0.8} textAlign="center">
                  {t("throwTryHint")}
                </Text>
                <Box alignSelf="center">
                  <Button
                    variant="sticker"
                    bg="mint"
                    onClick={fire}
                    data-sfx="confirm"
                    data-testid="try-throw"
                  >
                    {t("tryThrow")}
                  </Button>
                </Box>
              </Stack>
              {skin ? <InteractionLayer source={source} /> : null}
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
