"use client";

import { Badge, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LuEye } from "react-icons/lu";
import { RewardChips } from "@/components/economy/wallet-chips";
import { SkinPreview } from "@/components/shop/skin-preview";
import { RARITY_COLOR, RARITY_PRICE, type SkinManifest } from "@/game/skins/skins";

type Props = {
  skin: SkinManifest;
  /** Nhãn thêm dưới tên (vd "đã có — sẽ ghi đè"). */
  badges?: ReactNode;
  onTry?: () => void;
  testId?: string;
};

// Thẻ skin đúng như người chơi thấy trong shop (xem trước ở admin: trước khi nhập gói / lưu
// metadata) — không có Mua / Trang bị, có "Thử" mở bàn mẫu thật nếu truyền onTry.
export function SkinCardPreview({ skin, badges, onTry, testId }: Props) {
  const t = useTranslations("Shop");
  const locale = useLocale();
  const name = locale === "en" ? skin.name.en : skin.name.vi;
  const desc = locale === "en" ? skin.description.en : skin.description.vi;
  const price = skin.default ? {} : RARITY_PRICE[skin.rarity];
  return (
    <Stack
      layerStyle="sticker"
      bg="paper"
      p={3}
      gap={2}
      data-testid={testId}
      borderColor={RARITY_COLOR[skin.rarity]}
      boxShadow={`5px 5px 0 0 ${skin.rarity === "common" ? "rgba(26,40,38,.85)" : RARITY_COLOR[skin.rarity]}`}
    >
      <SkinPreview skin={skin} />
      <HStack justify="space-between" align="flex-start" gap={1}>
        <Text fontWeight="700" fontSize="lg" lineHeight="1.1" truncate title={name}>
          {name || "…"}
        </Text>
        <Badge
          bg={RARITY_COLOR[skin.rarity]}
          color="ink"
          border="2px solid"
          borderColor="ink"
          borderRadius="full"
          px={2}
          fontFamily="hand"
          fontSize="xs"
          textTransform="none"
          flexShrink={0}
        >
          {t(`rarity.${skin.rarity}`)}
        </Badge>
      </HStack>
      <Text fontSize="sm" opacity={0.8} lineClamp={2} minH="2.6em">
        {desc}
      </Text>
      {badges}
      <HStack justify="space-between" align="center" gap={2} mt="auto">
        {skin.default ? (
          <Text fontSize="sm" fontWeight="600">
            {t("free")}
          </Text>
        ) : (
          <RewardChips reward={price} />
        )}
        {onTry ? (
          <Button variant="sticker" size="xs" onClick={onTry} data-sfx="open">
            <LuEye /> {t("try")}
          </Button>
        ) : null}
      </HStack>
    </Stack>
  );
}
