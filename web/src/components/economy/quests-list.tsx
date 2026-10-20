"use client";

import { Box, Button, HStack, Progress, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState } from "react";
import { LuCheck } from "react-icons/lu";
import { RewardChips, useRewardLabel } from "@/components/economy/wallet-chips";
import { toaster } from "@/components/ui/toaster";
import { ApiError, type ProgressOut, type QuestOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

type QuestId = "d_play3" | "d_win1" | "d_combo3" | "w_play15" | "w_win_online3" | "w_daily5";

// Nhiệm vụ ngày / tuần (ADR-0010): thanh tiến trình, nút Nhận khi đủ, đồng hồ đếm tới lúc làm mới.
export function QuestsList({ progress }: { progress: ProgressOut }) {
  const t = useTranslations("Economy");
  const user = useAuth((s) => s.user);
  // Khách: mời tạo tài khoản; đã có tài khoản nhưng chưa xác minh: chỉ nhắc xác minh.
  const needHint = user && !user.isGuest ? t("needVerify") : t("needAccount");
  const groups = (["daily", "weekly"] as const).map((scope) => ({
    scope,
    reset: scope === "daily" ? progress.dailyReset : progress.weeklyReset,
    quests: progress.quests.filter((q) => q.scope === scope),
  }));
  return (
    <Stack gap={3}>
      {!progress.canClaim ? (
        <Text fontSize="sm" opacity={0.8}>
          {needHint}
        </Text>
      ) : null}
      {groups.map((g) => (
        <Stack key={g.scope} gap={2}>
          <HStack justify="space-between" align="baseline">
            <Text fontWeight="700" fontSize="lg">
              {t(g.scope)}
            </Text>
            <ResetIn at={g.reset} />
          </HStack>
          {g.quests.map((q) => (
            <QuestCard key={q.id} quest={q} canClaim={progress.canClaim} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function ResetIn({ at }: { at: number }) {
  const t = useTranslations("Economy");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const left = Math.max(0, at - now.getTime());
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const time =
    days > 0
      ? `${format.number(days)}d ${hours}h`
      : hours > 0
        ? `${hours}h ${String(minutes).padStart(2, "0")}m`
        : `${minutes}m`;
  return (
    <Text fontSize="sm" opacity={0.7}>
      {t("resetsIn", { time })}
    </Text>
  );
}

function QuestCard({ quest, canClaim }: { quest: QuestOut; canClaim: boolean }) {
  const t = useTranslations("Economy");
  const claimQuest = useAuth((s) => s.claimQuest);
  const rewardLabel = useRewardLabel();
  const [busy, setBusy] = useState(false);
  const done = quest.progress >= quest.target;
  const id = quest.id as QuestId;

  async function onClaim() {
    setBusy(true);
    try {
      const reward = await claimQuest(quest.id);
      toaster.success({ title: t("rewardToast", { reward: rewardLabel(reward) }) });
    } catch (e) {
      toaster.error({ title: e instanceof ApiError && e.message ? e.message : t("quests") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <HStack
      gap={3}
      align="center"
      bg={quest.claimed ? "cream" : "paper"}
      border="2px solid"
      borderColor="ink"
      borderRadius="lg"
      px={3}
      py={2}
      opacity={quest.claimed ? 0.7 : 1}
    >
      <Stack gap={1} flex="1" minW={0}>
        <HStack justify="space-between" align="baseline">
          <Text fontWeight="700" truncate>
            {t(`questName.${id}`)}
          </Text>
          <Text fontSize="sm" fontWeight="600" flexShrink={0}>
            {t("progress", { progress: String(quest.progress), target: String(quest.target) })}
          </Text>
        </HStack>
        <Text fontSize="sm" opacity={0.8} lineHeight="1.2">
          {t(`questDesc.${id}`)}
        </Text>
        <Progress.Root
          value={quest.progress}
          max={quest.target}
          size="sm"
          colorPalette="green"
          borderRadius="full"
        >
          <Progress.Track bg="cream" border="1px solid" borderColor="ink" borderRadius="full">
            <Progress.Range bg={done ? "mint" : "sun"} />
          </Progress.Track>
        </Progress.Root>
        <RewardChips reward={quest.reward} muted={quest.claimed} />
      </Stack>
      <Box flexShrink={0}>
        {quest.claimed ? (
          <HStack color="ink" fontSize="sm" fontWeight="600">
            <LuCheck /> {t("claimed")}
          </HStack>
        ) : (
          <Button
            size="sm"
            variant="sticker"
            bg="mint"
            disabled={!done || !canClaim}
            loading={busy}
            onClick={onClaim}
          >
            {t("claim")}
          </Button>
        )}
      </Box>
    </HStack>
  );
}
