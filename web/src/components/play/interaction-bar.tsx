"use client";

import { Box, Button, HStack, IconButton, Popover, Portal, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuSmile } from "react-icons/lu";
import { ThrowIcon } from "@/components/play/throw-art";
import { useSkinName } from "@/components/shop/skin-card";
import { EMOTE_EMOJI, EMOTES, INTERACT_COOLDOWN_MS, type EmoteId } from "@/game/interactions";
import { assetUrl, type ThrowSkin } from "@/game/skins/skins";
import { Link } from "@/i18n/navigation";

/**
 * Thanh tương tác trong trận (docs/08 — Đồ ném): nút biểu cảm (popover 8 emoji) + các món đồ ném
 * mình sở hữu (bấm là ném vào đối thủ). Sau mỗi lần gửi khoá INTERACT_COOLDOWN_MS (khớp giới hạn
 * server) để không spam. Liên kết tới Shop để mua thêm.
 */
export function InteractionBar({
  items,
  disabled,
  onEmote,
  onThrow,
  shopLink = true,
}: {
  /** Đồ ném mình có (default + đã mua), theo thứ tự hiển thị. */
  items: ThrowSkin[];
  /** Ván chưa bắt đầu / đã kết thúc / không có đối thủ. */
  disabled?: boolean;
  onEmote: (id: EmoteId) => void;
  onThrow: (id: string) => void;
  shopLink?: boolean;
}) {
  const t = useTranslations("Play");
  const skinName = useSkinName();
  // Giây còn phải chờ (đếm lùi mỗi giây); 0 = gửi được.
  const [left, setLeft] = useState(0);
  const [open, setOpen] = useState(false);
  const cooling = left > 0;
  useEffect(() => {
    if (!cooling) return;
    const id = setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooling, left]);
  const fire = (f: () => void) => {
    if (disabled || cooling) return;
    f();
    setLeft(Math.ceil(INTERACT_COOLDOWN_MS / 1000));
  };
  const locked = !!disabled || cooling;

  return (
    <HStack gap={1.5} flexWrap="wrap" justify="center" data-testid="interaction-bar">
      <Popover.Root
        open={open}
        onOpenChange={(e) => setOpen(e.open)}
        positioning={{ placement: "top" }}
      >
        <Popover.Trigger asChild>
          <IconButton
            aria-label={t("emote")}
            title={t("emote")}
            variant="sticker"
            size="sm"
            bg="sun"
            borderRadius="full"
            disabled={locked}
            data-sfx="open"
            data-testid="emote-button"
          >
            <LuSmile />
          </IconButton>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content layerStyle="sticker" p={2} w="auto" maxW="min(92vw, 320px)">
              <HStack gap={1} flexWrap="wrap" justify="center">
                {EMOTES.map((id) => (
                  <Button
                    key={id}
                    variant="ghost"
                    size="sm"
                    fontSize="24px"
                    px={1}
                    aria-label={id}
                    onClick={() => {
                      setOpen(false);
                      fire(() => onEmote(id));
                    }}
                    data-testid={`emote-${id}`}
                  >
                    {EMOTE_EMOJI[id]}
                  </Button>
                ))}
              </HStack>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>

      {items.map((skin) => (
        <IconButton
          key={skin.id}
          aria-label={t("throwItem", { name: skinName(skin) })}
          title={skinName(skin)}
          variant="sticker"
          size="sm"
          bg="paper"
          borderRadius="full"
          p={0}
          disabled={locked}
          onClick={() => fire(() => onThrow(skin.id))}
          data-sfx="click"
          data-testid={`throw-${skin.id}`}
        >
          <ThrowIcon skin={skin} size={26} imageUrl={assetUrl(skin, skin.throw.image)} />
        </IconButton>
      ))}

      {cooling ? (
        <Text fontSize="xs" color="cream" opacity={0.8} fontVariantNumeric="tabular-nums">
          {t("cooldown", { s: String(left) })}
        </Text>
      ) : shopLink ? (
        <Box asChild fontSize="xs" color="cream" opacity={0.8} textDecoration="underline">
          <Link href="/shop">{t("moreItems")}</Link>
        </Box>
      ) : null}
    </HStack>
  );
}
