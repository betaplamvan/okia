"use client";

import { Avatar, Button } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/stores/auth";

// Nút avatar nhỏ ở header: mở hộp thoại hồ sơ (dùng được ở mọi trang, kể cả /play).
export function UserButton() {
  const t = useTranslations("Auth");
  const user = useAuth((s) => s.user);
  const openProfile = useAuth((s) => s.openProfile);
  return (
    <Button
      variant="sticker"
      size="sm"
      px={1.5}
      aria-label={t("profile")}
      onClick={() => openProfile()}
      data-testid="user-button"
    >
      <Avatar.Root size="2xs" bg={user?.isGuest === false ? "mint" : "sun"} color="ink">
        <Avatar.Fallback name={user?.displayName ?? "?"} fontWeight="700" />
        {user?.avatarUrl ? <Avatar.Image src={user.avatarUrl} /> : null}
      </Avatar.Root>
    </Button>
  );
}
