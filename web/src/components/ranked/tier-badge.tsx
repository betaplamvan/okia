"use client";

import { HStack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuCrown, LuGraduationCap } from "react-icons/lu";
import type { RankOut, Tier } from "@/lib/api";

// Màu huy hiệu theo hạng (docs/07, docs/14): leo dần từ giấy → mint → sun → pink → coral.
export const TIER_TONE: Record<Tier, string> = {
  scratch: "paper",
  notebook: "mint",
  good: "sun",
  honor: "pink",
  valedictorian: "coral",
  topscholar: "sun",
};

const ROMAN = ["", "I", "II", "III"];

/** Tên hạng + bậc: "Vở ô li II", "Thủ khoa". */
export function useRankLabel() {
  const t = useTranslations("Ranked");
  return (rank: RankOut | null | undefined) =>
    rank
      ? `${t(`tier.${rank.tier}`)}${rank.division ? ` ${ROMAN[rank.division]}` : ""}`
      : t("placing");
}

type Props = {
  rank: RankOut | null | undefined;
  size?: "sm" | "md" | "lg";
  /** Hiện điểm bên cạnh tên hạng. */
  showPoints?: boolean;
};

/** Huy hiệu hạng dạng pill sticker; null = "Đang phân hạng" (viền đứt). */
export function TierBadge({ rank, size = "md", showPoints }: Props) {
  const label = useRankLabel();
  const t = useTranslations("Ranked");
  const px = { sm: 1.5, md: 2.5, lg: 4 }[size];
  const fontSize = { sm: "xs", md: "sm", lg: "xl" }[size];
  return (
    <HStack
      as="span"
      display="inline-flex"
      gap={1}
      bg={rank ? TIER_TONE[rank.tier] : "paper"}
      color="ink"
      border={rank ? "2px solid" : "2px dashed"}
      borderColor="ink"
      borderRadius="full"
      px={px}
      py={size === "lg" ? 1 : 0}
      fontSize={fontSize}
      fontWeight="700"
      lineHeight="1.4"
      whiteSpace="nowrap"
      opacity={rank ? 1 : 0.8}
      data-testid="tier-badge"
    >
      {rank?.tier === "valedictorian" ? <LuGraduationCap /> : null}
      {rank?.tier === "topscholar" ? <LuCrown /> : null}
      <Text as="span">{label(rank)}</Text>
      {showPoints && rank ? (
        <Text as="span" fontWeight="600" opacity={0.8}>
          · {t("points", { n: String(rank.points) })}
        </Text>
      ) : null}
    </HStack>
  );
}
