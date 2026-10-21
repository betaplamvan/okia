"use client";

import { Box, HStack, Progress, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { TierBadge } from "@/components/ranked/tier-badge";
import { DIVISION_SIZE, TIER_SIZE, TIERS, type MyRankOut } from "@/lib/api";

// Thẻ hạng của tôi (docs/07): huy hiệu + điểm, thanh tiến tới bậc kế, thống kê mùa, vị trí BXH.
export function RankCard({ rank, compact }: { rank: MyRankOut; compact?: boolean }) {
  const t = useTranslations("Ranked");
  const locale = useLocale();
  const format = useFormatter();
  const seasonName = locale === "en" ? rank.season.name.en : rank.season.name.vi;
  const placing = rank.rank === null;
  const top = rank.rank?.tier === "valedictorian" || rank.rank?.tier === "topscholar";
  // Tiến độ trong bậc hiện tại (100 điểm mỗi bậc); Thủ khoa không có bậc.
  const within = top ? DIVISION_SIZE : rank.points % DIVISION_SIZE;
  const toNext = DIVISION_SIZE - within;
  const placementDone = rank.placementGames - rank.placementLeft;

  return (
    <Stack gap={3} bg="cream" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
      <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={2}>
        <Stack gap={1}>
          <TierBadge rank={rank.rank} size="lg" />
          <Text fontSize="sm" opacity={0.75}>
            {t("season", { name: seasonName })} ·{" "}
            {t("endsAt", { date: format.dateTime(new Date(rank.season.endsAt), "short") })}
          </Text>
        </Stack>
        <Stack gap={0} align="flex-end">
          <Text fontSize="4xl" fontWeight="700" lineHeight="1" data-testid="rank-points">
            {format.number(rank.points)}
          </Text>
          <Text fontSize="sm" opacity={0.75}>
            {t("pointsShort")}
          </Text>
        </Stack>
      </HStack>

      {placing ? (
        <Stack gap={1}>
          <Text fontSize="sm" fontWeight="600">
            {rank.placementLeft > 0
              ? t("placement", { n: String(rank.placementLeft) })
              : t("placementDone")}
          </Text>
          <Progress.Root
            value={placementDone}
            max={rank.placementGames}
            size="sm"
            colorPalette="green"
          >
            <Progress.Track bg="paper" border="2px solid" borderColor="ink" borderRadius="full">
              <Progress.Range bg="mint" />
            </Progress.Track>
          </Progress.Root>
        </Stack>
      ) : (
        <Stack gap={1}>
          <Text fontSize="sm" fontWeight="600">
            {rank.rank?.tier === "topscholar"
              ? t("topScholar")
              : top
                ? t("topTier")
                : t("nextDivision", { n: String(toNext) })}
          </Text>
          <Progress.Root value={within} max={DIVISION_SIZE} size="sm">
            <Progress.Track bg="paper" border="2px solid" borderColor="ink" borderRadius="full">
              <Progress.Range bg="sun" />
            </Progress.Track>
          </Progress.Root>
          {!compact ? <TierLadder tier={rank.rank?.tier ?? "scratch"} /> : null}
        </Stack>
      )}

      <SimpleGrid columns={compact ? 2 : { base: 2, sm: 3 }} gap={2} fontSize="sm">
        <Stat label={t("record", { wins: String(rank.wins), losses: String(rank.losses) })} />
        <Stat
          label={`${t("streak", { n: String(rank.streak) })} · ${t("bestStreak", { n: String(rank.bestStreak) })}`}
        />
        <Stat
          label={rank.position ? t("position", { n: String(rank.position) }) : t("noPosition")}
          highlight={!!rank.position}
        />
      </SimpleGrid>
    </Stack>
  );
}

function Stat({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <Box
      bg={highlight ? "sun" : "paper"}
      border="2px solid"
      borderColor="ink"
      borderRadius="md"
      px={2}
      py={1}
      textAlign="center"
      fontWeight="600"
    >
      {label}
    </Box>
  );
}

// Thang hạng: 5 ô, ô hiện tại nổi bật — nhìn là biết còn bao xa tới Thủ khoa.
function TierLadder({ tier }: { tier: MyRankOut["rank"] extends infer R ? string : never }) {
  const t = useTranslations("Ranked");
  const idx = TIERS.indexOf(tier as (typeof TIERS)[number]);
  return (
    <HStack gap={1} mt={1} flexWrap="wrap">
      {TIERS.map((k, i) => (
        <Text
          key={k}
          as="span"
          fontSize="xs"
          px={1.5}
          borderRadius="full"
          border="2px solid"
          borderColor={i === idx ? "ink" : "transparent"}
          bg={i === idx ? "sun" : "transparent"}
          opacity={i <= idx ? 1 : 0.5}
          title={`${i * TIER_SIZE}+`}
        >
          {t(`tier.${k}`)}
        </Text>
      ))}
    </HStack>
  );
}
