"use client";

import { Box, Button, HStack, Progress, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState } from "react";
import {
  LuCalendarCheck,
  LuCalendarDays,
  LuCheck,
  LuGamepad2,
  LuSwords,
  LuTrophy,
  LuZap,
} from "react-icons/lu";
import { RewardChips, useRewardLabel } from "@/components/economy/wallet-chips";
import { toaster } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { ApiError, type ProgressOut, type QuestOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

type QuestId = "d_play3" | "d_win1" | "d_combo3" | "w_play15" | "w_win_online3" | "w_daily5";

// Icon + nơi "Chơi ngay" dẫn tới cho từng nhiệm vụ (thắng online → xếp hạng; còn lại → chơi với máy).
const QUEST_META: Record<QuestId, { Icon: typeof LuGamepad2; href: string; tone: string }> = {
  d_play3: { Icon: LuGamepad2, href: "/play", tone: "mint" },
  d_win1: { Icon: LuTrophy, href: "/play", tone: "sun" },
  d_combo3: { Icon: LuZap, href: "/play", tone: "coral" },
  w_play15: { Icon: LuCalendarDays, href: "/play", tone: "mint" },
  w_win_online3: { Icon: LuSwords, href: "/ranked", tone: "coral" },
  w_daily5: { Icon: LuCalendarCheck, href: "/play", tone: "pink" },
};

// Nhiệm vụ ngày / tuần (ADR-0010, bố cục học noitu): thẻ có icon tròn bên trái, tên + thanh tiến
// trình + số, thưởng bên dưới; bên phải là "Chơi ngay" (chưa đủ) / "Nhận" (đủ) / dấu đã nhận.
export function QuestsList({ progress }: { progress: ProgressOut }) {
  const t = useTranslations("Economy");
  const groups = (["daily", "weekly"] as const).map((scope) => ({
    scope,
    reset: scope === "daily" ? progress.dailyReset : progress.weeklyReset,
    quests: progress.quests.filter((q) => q.scope === scope),
  }));
  return (
    <Stack gap={4}>
      {!progress.canClaim ? (
        <Text fontSize="sm" opacity={0.8}>
          {t("needAccount")}
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
  const closeGift = useAuth((s) => s.closeGift);
  const rewardLabel = useRewardLabel();
  const [busy, setBusy] = useState(false);
  const done = quest.progress >= quest.target;
  const id = quest.id as QuestId;
  const meta = QUEST_META[id] ?? QUEST_META.d_play3;

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
      bg={quest.claimed ? "cream" : done ? "#fff6c2" : "paper"}
      border="2px solid"
      borderColor="ink"
      borderRadius="lg"
      px={3}
      py={2.5}
      opacity={quest.claimed ? 0.65 : 1}
      data-testid={`quest-${quest.id}`}
    >
      <Box
        flexShrink={0}
        w="40px"
        h="40px"
        display="grid"
        placeItems="center"
        bg={meta.tone}
        color="ink"
        border="2px solid"
        borderColor="ink"
        borderRadius="full"
        fontSize="lg"
        aria-hidden="true"
      >
        <meta.Icon />
      </Box>
      <Stack gap={1} flex="1" minW={0}>
        <Text fontWeight="700" lineHeight="1.2" truncate title={t(`questDesc.${id}`)}>
          {t(`questName.${id}`)}
        </Text>
        <Text fontSize="xs" opacity={0.75} lineHeight="1.2" truncate>
          {t(`questDesc.${id}`)}
        </Text>
        <HStack gap={2}>
          <Progress.Root
            value={Math.min(quest.progress, quest.target)}
            max={quest.target}
            size="sm"
            flex="1"
            borderRadius="full"
          >
            <Progress.Track bg="cream" border="1px solid" borderColor="ink" borderRadius="full">
              <Progress.Range bg={done ? "mint" : "sun"} />
            </Progress.Track>
          </Progress.Root>
          <Text fontSize="xs" fontWeight="600" flexShrink={0} opacity={0.8}>
            {t("progress", { progress: String(quest.progress), target: String(quest.target) })}
          </Text>
        </HStack>
        <RewardChips reward={quest.reward} muted={quest.claimed} />
      </Stack>
      <Box flexShrink={0}>
        {quest.claimed ? (
          <HStack color="ink" fontSize="sm" fontWeight="600">
            <LuCheck /> {t("claimed")}
          </HStack>
        ) : done ? (
          <Button
            size="sm"
            variant="sticker"
            bg="mint"
            disabled={!canClaim}
            loading={busy}
            onClick={onClaim}
          >
            {t("claim")}
          </Button>
        ) : (
          <Button asChild size="sm" variant="sticker" bg="sun" onClick={closeGift}>
            <Link href={meta.href}>{t("playNow")}</Link>
          </Button>
        )}
      </Box>
    </HStack>
  );
}
