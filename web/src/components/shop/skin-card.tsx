"use client";

import { Badge, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { LuCheck, LuEye, LuShoppingBag } from "react-icons/lu";
import { RewardChips } from "@/components/economy/wallet-chips";
import { SkinPreview } from "@/components/shop/skin-preview";
import { RARITY_COLOR, RARITY_PRICE, type SkinManifest } from "@/game/skins/skins";

export function useSkinName() {
  const locale = useLocale();
  return (s: SkinManifest) => (locale === "en" ? s.name.en : s.name.vi);
}

type Props = {
  skin: SkinManifest;
  owned: boolean;
  equipped: boolean;
  canBuy: boolean;
  busy?: boolean;
  onTry: () => void;
  onBuy: () => void;
  onEquip: () => void;
};

// Thẻ skin trong shop (docs/06 — Shop): xem trước, tên, bậc hiếm (màu), giá, Thử / Mua / Trang bị.
export function SkinCard({ skin, owned, equipped, canBuy, busy, onTry, onBuy, onEquip }: Props) {
  const t = useTranslations("Shop");
  const locale = useLocale();
  const name = locale === "en" ? skin.name.en : skin.name.vi;
  const desc = locale === "en" ? skin.description.en : skin.description.vi;
  const price = skin.default ? {} : RARITY_PRICE[skin.rarity];
  return (
    <Stack
      layerStyle="sticker"
      bg={equipped ? "mint" : "paper"}
      p={3}
      gap={2}
      position="relative"
      data-testid={`skin-${skin.id}`}
      borderColor={RARITY_COLOR[skin.rarity]}
      boxShadow={`5px 5px 0 0 ${skin.rarity === "common" ? "rgba(26,40,38,.85)" : RARITY_COLOR[skin.rarity]}`}
    >
      <SkinPreview skin={skin} />
      <HStack justify="space-between" align="flex-start" gap={1}>
        <Text fontWeight="700" fontSize="lg" lineHeight="1.1" truncate title={name}>
          {name}
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
      <HStack justify="space-between" align="center" gap={2} mt="auto">
        {skin.default ? (
          <Text fontSize="sm" fontWeight="600">
            {t("free")}
          </Text>
        ) : owned ? (
          <Text fontSize="sm" fontWeight="600">
            <LuCheck style={{ display: "inline" }} /> {t("owned")}
          </Text>
        ) : (
          <RewardChips reward={price} />
        )}
        <Button variant="sticker" size="xs" onClick={onTry} aria-label={t("try")}>
          <LuEye /> {t("try")}
        </Button>
      </HStack>
      {equipped ? (
        <Button variant="sticker" size="sm" bg="paper" disabled>
          <LuCheck /> {t("equipped")}
        </Button>
      ) : owned ? (
        <Button
          variant="sticker"
          size="sm"
          bg="sun"
          onClick={onEquip}
          loading={busy}
          disabled={!canBuy}
        >
          {t("equip")}
        </Button>
      ) : (
        <Button
          variant="sticker"
          size="sm"
          bg="coral"
          onClick={onBuy}
          loading={busy}
          disabled={!canBuy}
        >
          <LuShoppingBag /> {t("buy")}
        </Button>
      )}
    </Stack>
  );
}
