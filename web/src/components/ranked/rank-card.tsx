"use client";

import { Box, HStack, Progress, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { RankEmblem } from "@/components/ranked/rank-emblem";
import { useRankLabel } from "@/components/ranked/tier-badge";
import { DIVISION_SIZE, TIER_SIZE, TIERS, type MyRankOut, type Tier } from "@/lib/api";

// Thẻ hạng của tôi (docs/07): huy hiệu + điểm, thanh tiến tới bậc kế, thống kê mùa, vị trí BXH.
export function RankCard({ rank, compact }: { rank: MyRankOut; compact?: boolean }) {
  const t = useTranslations("Ranked");
  const locale = useLocale();
  const format = useFormatter();
  const rankLabel = useRankLabel();
  const seasonName = locale === "en" ? rank.season.name.en : rank.season.name.vi;
  const placing = rank.rank === null;
  const top = rank.rank?.tier === "valedictorian" || rank.rank?.tier === "topscholar";
  // Tiến độ trong bậc hiện tại (100 điểm mỗi bậc); Thủ khoa không có bậc.
  const within = top ? DIVISION_SIZE : rank.points % DIVISION_SIZE;
  const toNext = DIVISION_SIZE - within;
  const placementDone = rank.placementGames - rank.placementLeft;

  return (
    <Stack gap={3} bg="cream" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
        <HStack gap={3} align="center">
          {/* Huy hiệu hạng (thiết kế 2026-10-21): khiên 112 px, #thứ hạng dưới khiên với hai bậc đỉnh. */}
          <RankEmblem
            rank={rank.rank}
            size={compact ? 88 : 112}
            position={rank.position}
            label={rankLabel(rank.rank)}
          />
          <Stack gap={0}>
            <Text fontSize="2xl" fontWeight="700" lineHeight="1.1" data-testid="rank-name">
              {rankLabel(rank.rank)}
            </Text>
            <Text fontSize="sm" opacity={0.75}>
              {t("season", { name: seasonName })}
            </Text>
            <Text fontSize="sm" opacity={0.75}>
              {t("endsAt", { date: format.dateTime(new Date(rank.season.endsAt), "short") })}
            </Text>
          </Stack>
        </HStack>
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
                ? rank.position && rank.position > 100
                  ? t("toTop100", { n: String(rank.position - 100) })
                  : t("topTier")
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

// Thang hạng: 6 khiên nhỏ, khiên hiện tại to và đậm, các khiên khác mờ — nhìn là biết còn bao xa.
function TierLadder({ tier }: { tier: Tier }) {
  const t = useTranslations("Ranked");
  const idx = TIERS.indexOf(tier);
  return (
    <HStack justify="space-between" mt={1} px={1} align="center">
      {TIERS.map((k, i) => (
        <Box
          key={k}
          opacity={i === idx ? 1 : 0.45}
          title={`${t(`tier.${k}`)}${k === "topscholar" ? "" : ` · ${i * TIER_SIZE}+`}`}
          display="flex"
        >
          <RankEmblem
            rank={{ tier: k, division: null, points: 0 }}
            size={i === idx ? 36 : 28}
            animate={false}
          />
        </Box>
      ))}
    </HStack>
  );
}
