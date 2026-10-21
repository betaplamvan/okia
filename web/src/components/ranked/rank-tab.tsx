"use client";

import { Avatar, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { LuSwords, LuTrophy } from "react-icons/lu";
import { RankCard } from "@/components/ranked/rank-card";
import { Link } from "@/i18n/navigation";
import type { HistoryOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Tab "Hạng" trong hồ sơ (P2-09): thẻ hạng + 10 trận xếp hạng gần nhất + lối tắt tìm trận / BXH.
export function RankTab() {
  const t = useTranslations("Ranked");
  const user = useAuth((s) => s.user);
  const rank = useAuth((s) => s.rank);
  const closeProfile = useAuth((s) => s.closeProfile);
  const openProfile = useAuth((s) => s.openProfile);

  if (user?.isGuest) {
    return (
      <Stack gap={3} bg="cream" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
        <Text fontWeight="700">{t("guestTitle")}</Text>
        <Text fontSize="sm">{t("guestBody")}</Text>
        <Button variant="sticker" size="sm" bg="mint" onClick={() => openProfile("account")}>
          {t("signIn")}
        </Button>
      </Stack>
    );
  }
  if (!rank) return <Text fontSize="sm">{t("loadError")}</Text>;

  return (
    <Stack gap={3}>
      <RankCard rank={rank} compact />
      <HStack gap={2} justify="center" flexWrap="wrap">
        <Button asChild variant="sticker" size="sm" bg="coral" onClick={closeProfile}>
          <Link href="/ranked">
            <LuSwords /> {t("find")}
          </Link>
        </Button>
        <Button asChild variant="sticker" size="sm" bg="sun" onClick={closeProfile}>
          <Link href="/leaderboard">
            <LuTrophy /> {t("leaderboardLink")}
          </Link>
        </Button>
      </HStack>
      <Text fontWeight="700">{t("history")}</Text>
      {rank.history.length === 0 ? (
        <Text fontSize="sm" opacity={0.75}>
          {t("noHistory")}
        </Text>
      ) : (
        <Stack gap={1.5}>
          {rank.history.map((h) => (
            <HistoryRow key={h.id} h={h} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function HistoryRow({ h }: { h: HistoryOut }) {
  const t = useTranslations("Ranked");
  const format = useFormatter();
  const tone = h.won === null ? "sun" : h.won ? "mint" : "coral";
  const name = h.opponentName ?? t("unknownOpponent");
  return (
    <HStack
      gap={2}
      bg="paper"
      border="2px solid"
      borderColor="ink"
      borderRadius="md"
      px={2}
      py={1}
      fontSize="sm"
    >
      <Text
        as="span"
        bg={tone}
        border="2px solid"
        borderColor="ink"
        borderRadius="full"
        px={1.5}
        fontWeight="700"
        minW="12"
        textAlign="center"
      >
        {h.won === null ? t("draw") : h.won ? t("win") : t("lose")}
      </Text>
      <Avatar.Root size="2xs" bg="sun" color="ink">
        <Avatar.Fallback name={name} />
        {h.opponentAvatarUrl ? <Avatar.Image src={h.opponentAvatarUrl} /> : null}
      </Avatar.Root>
      <Text truncate minW={0} flex="1" title={name}>
        {name}
      </Text>
      <Text as="span" fontWeight="600" opacity={0.8}>
        {h.scores[0]}–{h.scores[1]}
      </Text>
      <Text
        as="span"
        fontWeight="700"
        minW="10"
        textAlign="right"
        color={h.pointsDelta >= 0 ? "ink" : "pen.red"}
      >
        {h.pointsDelta >= 0 ? "+" : ""}
        {format.number(h.pointsDelta)}
      </Text>
    </HStack>
  );
}
