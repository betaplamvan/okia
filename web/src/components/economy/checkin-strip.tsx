"use client";

import { Box, Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuCheck } from "react-icons/lu";
import { RewardChips, useRewardLabel } from "@/components/economy/wallet-chips";
import { toaster } from "@/components/ui/toaster";
import { ApiError, type ProgressOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Điểm danh 7 ngày (ADR-0010): ô ngày đã nhận tô mint, ngày hôm nay nổi bật, ngày 7 có Hoa điểm tốt.
export function CheckinStrip({ progress }: { progress: ProgressOut }) {
  const t = useTranslations("Economy");
  const checkin = useAuth((s) => s.checkin);
  const rewardLabel = useRewardLabel();
  const [busy, setBusy] = useState(false);
  const { checkedToday, cycleDay, streak, rewards } = progress.checkin;
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
    <Stack gap={3} bg="cream" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
      <HStack justify="space-between" align="baseline">
        <Text fontWeight="700" fontSize="lg">
          {t("checkinTitle")}
        </Text>
        <Text fontSize="sm" opacity={0.75}>
          {t("streak", { n: String(streak) })}
        </Text>
      </HStack>
      <SimpleGrid columns={7} gap={1.5}>
        {rewards.map((reward, i) => {
          const day = i + 1;
          const done = day <= doneCount;
          const today = !checkedToday && day === cycleDay;
          return (
            <Stack
              key={day}
              gap={1}
              align="center"
              bg={done ? "mint" : today ? "sun" : "paper"}
              border="2px solid"
              borderColor="ink"
              borderRadius="md"
              boxShadow={today ? "stickerSm" : undefined}
              px={0.5}
              py={1.5}
              minW={0}
              position="relative"
            >
              <Text fontSize="xs" fontWeight="700" lineHeight="1">
                {t("day", { n: String(day) })}
              </Text>
              <RewardChips reward={reward} muted={done} />
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
          bg={checkedToday ? "paper" : "mint"}
          size="sm"
          disabled={checkedToday}
          loading={busy}
          onClick={onCheckin}
        >
          {checkedToday ? <LuCheck /> : null} {checkedToday ? t("checkedIn") : t("checkinButton")}
        </Button>
      )}
      <Text fontSize="xs" opacity={0.65}>
        {t("checkinHint")}
      </Text>
    </Stack>
  );
}
