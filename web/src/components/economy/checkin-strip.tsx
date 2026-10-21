"use client";

import { Box, Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuCheck, LuFlame, LuGift } from "react-icons/lu";
import { RewardChips, useRewardLabel } from "@/components/economy/wallet-chips";
import { toaster } from "@/components/ui/toaster";
import { ApiError, type ProgressOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Điểm danh 7 ngày (ADR-0010, bố cục học noitu): dòng "Chuỗi / Kỷ lục", lưới thẻ ngày (4 + 3),
// ngày đã nhận tô mint, hôm nay viền đậm + bóng, ngày 7 có hộp quà + Hoa điểm tốt; nút rộng ở đáy.
export function CheckinStrip({ progress }: { progress: ProgressOut }) {
  const t = useTranslations("Economy");
  const checkin = useAuth((s) => s.checkin);
  const rewardLabel = useRewardLabel();
  const [busy, setBusy] = useState(false);
  const { checkedToday, cycleDay, streak, bestStreak, rewards } = progress.checkin;
  // Số ô đã nhận trong chu kỳ hiện tại.
  const doneCount = checkedToday ? cycleDay : cycleDay - 1;

  async function onCheckin() {
    setBusy(true);
    try {
      const reward = await checkin();
      toaster.success({ title: t("rewardToast", { reward: rewardLabel(reward) }) });
    } catch (e) {
      toaster.error({ title: e instanceof ApiError && e.message ? e.message : t("checkin") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={3}>
      <HStack justify="space-between" align="baseline">
        <HStack gap={1} fontWeight="700">
          <Box color="coral" aria-hidden="true">
            <LuFlame />
          </Box>
          <Text>{t("streak", { n: String(streak) })}</Text>
        </HStack>
        <Text fontSize="sm" opacity={0.75}>
          {t("bestStreak", { n: String(bestStreak) })}
        </Text>
      </HStack>

      <SimpleGrid columns={{ base: 4, sm: 4 }} gap={2}>
        {rewards.map((reward, i) => {
          const day = i + 1;
          const done = day <= doneCount;
          const today = day === cycleDay;
          const last = day === rewards.length;
          return (
            <Stack
              key={day}
              gap={1.5}
              align="center"
              bg={done ? "mint" : "paper"}
              border="2px solid"
              borderColor={last && !done ? "sun" : "ink"}
              borderWidth={today || last ? "3px" : "2px"}
              borderRadius="lg"
              boxShadow={today ? "stickerSm" : undefined}
              opacity={!done && !today && day < cycleDay ? 0.5 : 1}
              px={1}
              py={2}
              minW={0}
              position="relative"
              data-testid={`checkin-day-${day}`}
            >
              <Text fontSize="sm" fontWeight="700" lineHeight="1">
                {t("day", { n: String(day) })}
              </Text>
              <RewardChips reward={reward} muted={done} />
              {last ? (
                <Box color="coral" fontSize="lg" lineHeight="1" aria-hidden="true">
                  <LuGift />
                </Box>
              ) : null}
              {done ? (
                <Box
                  position="absolute"
                  top={-2}
                  right={-2}
                  bg="ink"
                  color="mint"
                  rounded="full"
                  p={0.5}
                >
                  <LuCheck size={10} />
                </Box>
              ) : null}
            </Stack>
          );
        })}
      </SimpleGrid>

      {!progress.canClaim ? (
        <Text fontSize="sm" opacity={0.8}>
          {t("needAccount")}
        </Text>
      ) : (
        <Button
          variant="sticker"
          bg={checkedToday ? "mint" : "sun"}
          size="lg"
          w="full"
          disabled={checkedToday}
          loading={busy}
          onClick={onCheckin}
          _disabled={{ opacity: 1, cursor: "default", boxShadow: "stickerSm" }}
        >
          {checkedToday ? t("checkedIn") : t("checkinButton")} {checkedToday ? <LuCheck /> : null}
        </Button>
      )}
      <Text fontSize="xs" opacity={0.65}>
        {t("checkinHint")}
      </Text>
    </Stack>
  );
}
