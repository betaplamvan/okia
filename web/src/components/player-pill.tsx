"use client";

import { Avatar, Button, HStack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { WalletChips } from "@/components/economy/wallet-chips";
import { useAuth } from "@/stores/auth";

// Pill người chơi trên trang chủ (học từ noitu): avatar + tên + Ruột chì; bấm mở hồ sơ.
// Dữ liệu từ store xác thực (/me); chưa tải xong thì hiện "Khách".
export function PlayerPill() {
  const t = useTranslations("Common");
  const ta = useTranslations("Auth");
  const user = useAuth((s) => s.user);
  const openProfile = useAuth((s) => s.openProfile);

  return (
    <Button
      variant="sticker"
      h="auto"
      px={2}
      py={1}
      mx="auto"
      w="fit-content"
      maxW="full"
      aria-label={ta("profile")}
      onClick={() => openProfile()}
      data-testid="player-pill"
    >
      <HStack gap={2}>
        <Avatar.Root size="sm" bg={user && !user.isGuest ? "mint" : "sun"} color="ink">
          <Avatar.Fallback name={user?.displayName ?? "?"} fontWeight="700" />
          {user?.avatarUrl ? <Avatar.Image src={user.avatarUrl} /> : null}
        </Avatar.Root>
        <Text fontWeight="600" pe={2} truncate maxW="40">
          {user?.displayName ?? t("guest")}
        </Text>
        <WalletChips wallet={user?.wallet} size="sm" />
      </HStack>
    </Button>
  );
}
