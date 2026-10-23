"use client";

import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { RankEmblem } from "@/components/ranked/rank-emblem";
import { DIVISION_SIZE, TIER_SIZE, TIERS, type RankOut, type Tier } from "@/lib/api";

const ROMAN = ["", "I", "II", "III"];

/**
 * Bảng các bậc hạng (docs/07, api/app/rating/points.py): 5 hạng theo điểm (mỗi hạng TIER_SIZE điểm,
 * 3 bậc III → I) + danh hiệu Trạng nguyên (top 100 Thủ khoa trên BXH, theo vị trí). Đánh dấu hạng
 * hiện tại; hàng dưới minh họa 3 bậc của hạng hiện tại (chưa có hạng → Giấy nháp).
 */
export function TierLadder({ rank }: { rank: RankOut | null | undefined }) {
  const t = useTranslations("Ranked");
  const format = useFormatter();
  const current = rank?.tier ?? null;
  const pts = (n: number) => format.number(n);
  const range = (tier: Tier) => {
    if (tier === "topscholar") return t("ladderTop");
    const i = TIERS.indexOf(tier);
    if (tier === "valedictorian") return t("ladderFrom", { n: pts(i * TIER_SIZE) });
    return t("ladderRange", { from: pts(i * TIER_SIZE), to: pts((i + 1) * TIER_SIZE - 1) });
  };
  // Hạng minh họa bậc: hạng hiện tại nếu có bậc, không thì Giấy nháp.
  const divTier: Tier =
    current && current !== "valedictorian" && current !== "topscholar" ? current : "scratch";
  const base = TIERS.indexOf(divTier) * TIER_SIZE;

  return (
    <Stack layerStyle="sticker" p={5} gap={4} data-testid="tier-ladder">
      <Stack gap={1}>
        <Text as="h2" fontSize="xl" fontWeight="700" color="ink">
          {t("ladderTitle")}
        </Text>
        <Text fontSize="sm">
          {t("ladderHint", { tier: String(TIER_SIZE), div: String(DIVISION_SIZE) })}
        </Text>
      </Stack>

      <SimpleGrid columns={{ base: 2, sm: 3, lg: 6 }} gap={3}>
        {TIERS.map((tier) => {
          const me = tier === current;
          return (
            <Stack
              key={tier}
              align="center"
              gap={1}
              textAlign="center"
              bg={me ? "sun" : "cream"}
              border="2px solid"
              borderColor="ink"
              borderRadius="lg"
              boxShadow={me ? "sticker" : undefined}
              px={2}
              pt={5}
              pb={3}
              position="relative"
              data-testid={`ladder-${tier}`}
              data-current={me || undefined}
            >
              {me ? (
                <Box
                  position="absolute"
                  top="-12px"
                  bg="coral"
                  color="ink"
                  border="2px solid"
                  borderColor="ink"
                  borderRadius="full"
                  px={2}
                  fontSize="xs"
                  fontWeight="700"
                  whiteSpace="nowrap"
                >
                  {t("ladderYou")}
                </Box>
              ) : null}
              <RankEmblem
                rank={{ tier, division: null, points: 0 }}
                size={72}
                label={t(`tier.${tier}`)}
              />
              <Text fontWeight="700" lineHeight="1.2">
                {t(`tier.${tier}`)}
              </Text>
              <Text fontSize="xs" opacity={0.8}>
                {range(tier)}
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>

      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="700">
          {t("ladderDivisions", { tier: t(`tier.${divTier}`) })}
        </Text>
        <SimpleGrid columns={3} gap={{ base: 2, md: 3 }} maxW={{ md: "560px" }}>
          {[3, 2, 1].map((d) => {
            const from = base + (3 - d) * DIVISION_SIZE;
            const me = rank?.tier === divTier && rank.division === d;
            return (
              <Stack
                key={d}
                direction={{ base: "column", md: "row" }}
                align="center"
                textAlign={{ base: "center", md: "start" }}
                gap={{ base: 1, md: 2 }}
                bg={me ? "sun" : "paper"}
                border="2px solid"
                borderColor="ink"
                borderRadius="lg"
                px={2}
                py={1}
                data-testid={`ladder-div-${d}`}
              >
                <RankEmblem rank={{ tier: divTier, division: d, points: from }} size={64} />
                <Stack gap={0}>
                  <Text fontWeight="700" lineHeight="1.2" fontSize={{ base: "sm", md: "md" }}>
                    {t(`tier.${divTier}`)} {ROMAN[d]}
                  </Text>
                  <Text fontSize="xs" opacity={0.8}>
                    {t("ladderRange", { from: pts(from), to: pts(from + DIVISION_SIZE - 1) })}
                  </Text>
                </Stack>
              </Stack>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
