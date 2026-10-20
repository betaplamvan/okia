"use client";

import { HStack, Text } from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { LuFlower, LuPencil } from "react-icons/lu";
import type { Reward, Wallet } from "@/lib/api";

// Hai loại tiền (ADR-0010): Ruột chì (vàng, bút chì) và Hoa điểm tốt (hồng, bông hoa).
const CHIP = {
  lead: { bg: "sun", Icon: LuPencil },
  flower: { bg: "pink", Icon: LuFlower },
} as const;

type Props = { wallet?: Wallet | null; size?: "sm" | "md" };

export function WalletChips({ wallet, size = "md" }: Props) {
  const t = useTranslations("Economy");
  const format = useFormatter();
  return (
    <HStack gap={1.5}>
      {(["lead", "flower"] as const).map((cur) => {
        const { bg, Icon } = CHIP[cur];
        return (
          <HStack
            key={cur}
            gap={1}
            bg={bg}
            border="2px solid"
            borderColor="ink"
            borderRadius="full"
            px={size === "sm" ? 2 : 3}
            py={0.5}
            fontWeight="600"
            fontSize={size === "sm" ? "sm" : "md"}
            color="ink"
            aria-label={t(cur)}
            title={t(cur)}
          >
            <Icon />
            <Text as="span">{format.number(wallet?.[cur] ?? 0)}</Text>
          </HStack>
        );
      })}
    </HStack>
  );
}

/** "+10 Ruột chì, +1 Hoa điểm tốt" cho toast / nhãn thưởng. */
export function useRewardLabel() {
  const t = useTranslations("Economy");
  const format = useFormatter();
  return (reward: Reward) =>
    (["lead", "flower"] as const)
      .filter((c) => (reward[c] ?? 0) > 0)
      .map((c) => `+${format.number(reward[c]!)} ${t(c)}`)
      .join(", ");
}

/** Nhãn thưởng gọn (icon + số) cho thẻ nhiệm vụ / ô điểm danh. */
export function RewardChips({ reward, muted }: { reward: Reward; muted?: boolean }) {
  const t = useTranslations("Economy");
  return (
    <HStack gap={1} opacity={muted ? 0.6 : 1} flexWrap="wrap">
      {(["lead", "flower"] as const)
        .filter((c) => (reward[c] ?? 0) > 0)
        .map((c) => {
          const { bg, Icon } = CHIP[c];
          return (
            <HStack
              key={c}
              gap={0.5}
              bg={bg}
              border="2px solid"
              borderColor="ink"
              borderRadius="full"
              px={1.5}
              fontSize="sm"
              fontWeight="700"
              color="ink"
              title={t(c)}
            >
              <Icon size={12} />
              <Text as="span">{reward[c]}</Text>
            </HStack>
          );
        })}
    </HStack>
  );
}
