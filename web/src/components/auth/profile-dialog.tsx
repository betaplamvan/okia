"use client";

import {
  Avatar,
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuPencilLine, LuShoppingBag } from "react-icons/lu";
import { AccountTab } from "@/components/auth/account-tab";
import { AvatarUpload } from "@/components/auth/avatar-upload";
import { EditProfileForm } from "@/components/auth/edit-profile-form";
import { CheckinStrip } from "@/components/economy/checkin-strip";
import { QuestsList } from "@/components/economy/quests-list";
import { RankTab } from "@/components/ranked/rank-tab";
import { WalletChips } from "@/components/economy/wallet-chips";
import { Link } from "@/i18n/navigation";
import { type ProfileTab, useAuth } from "@/stores/auth";

// Hồ sơ người chơi dạng hộp thoại (học từ noitu): avatar + tên + huy hiệu, ví hai loại tiền,
// "Chỉnh sửa hồ sơ" (tên, ngôn ngữ, ảnh đại diện), tab Tổng quan (điểm danh) / Nhiệm vụ / Tài khoản.
export function ProfileDialog() {
  const t = useTranslations("Auth");
  const te = useTranslations("Economy");
  const tr = useTranslations("Ranked");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const user = useAuth((s) => s.user);
  const progress = useAuth((s) => s.progress);
  const open = useAuth((s) => s.profileOpen);
  const tab = useAuth((s) => s.profileTab);
  const openProfile = useAuth((s) => s.openProfile);
  const closeProfile = useAuth((s) => s.closeProfile);
  const [editing, setEditing] = useState(false);

  return (
    <Dialog.Root
      placement="center"
      motionPreset="slide-in-bottom"
      size={{ mdDown: "full", md: "md" }}
      scrollBehavior="inside"
      open={open}
      onOpenChange={(e) => {
        if (!e.open) {
          closeProfile();
          setEditing(false);
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
        <Dialog.Positioner px={{ base: 0, md: 4 }}>
          <Dialog.Content
            layerStyle="sticker"
            p={0}
            overflow="hidden"
            borderRadius={{ base: 0, md: "sticker" }}
            border={{ base: "none", md: "sticker" }}
          >
            <Dialog.Header bg="mint" borderBottom="sticker" py={4}>
              <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                {t("profile")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body color="ink" py={5}>
              {!user ? (
                <Text>{t("loading")}</Text>
              ) : (
                <Stack gap={4}>
                  <HStack gap={3} align="center">
                    <Avatar.Root size="xl" border="sticker" bg="sun" color="ink">
                      <Avatar.Fallback name={user.displayName} fontWeight="700" />
                      {user.avatarUrl ? <Avatar.Image src={user.avatarUrl} /> : null}
                    </Avatar.Root>
                    <Stack gap={1} minW={0}>
                      <Text fontSize="2xl" fontWeight="700" lineHeight="1.1" truncate>
                        {user.displayName}
                      </Text>
                      <HStack gap={2} flexWrap="wrap">
                        {user.isGuest ? (
                          <Pill tone="paper">{t("guestBadge")}</Pill>
                        ) : (
                          <Pill tone="mint">{t("verifiedBadge")}</Pill>
                        )}
                        <Pill tone="paper">
                          {t("joined", {
                            date: format.dateTime(new Date(user.createdAt), "short"),
                          })}
                        </Pill>
                      </HStack>
                    </Stack>
                  </HStack>

                  {editing ? (
                    <Stack gap={3}>
                      <EditProfileForm onDone={() => setEditing(false)} />
                      <Box bg="cream" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
                        <Text fontWeight="700" mb={2}>
                          {te("avatar")}
                        </Text>
                        <AvatarUpload />
                      </Box>
                    </Stack>
                  ) : (
                    <HStack gap={2} justify="center" flexWrap="wrap">
                      <Button variant="sticker" size="sm" bg="sun" onClick={() => setEditing(true)}>
                        <LuPencilLine /> {t("editProfile")}
                      </Button>
                      <WalletChips wallet={user.wallet} />
                      <Button asChild variant="sticker" size="sm" onClick={closeProfile}>
                        <Link href="/shop">
                          <LuShoppingBag /> {tc("shop")}
                        </Link>
                      </Button>
                    </HStack>
                  )}

                  <Tabs.Root
                    value={tab}
                    onValueChange={(e) => openProfile(e.value as ProfileTab)}
                    variant="plain"
                    lazyMount
                  >
                    <Tabs.List gap={2} justifyContent="center" flexWrap="wrap">
                      {(["overview", "rank", "quests", "account"] as const).map((key) => (
                        <Tabs.Trigger
                          key={key}
                          value={key}
                          bg={tab === key ? "mint" : "paper"}
                          color="ink"
                          border="sticker"
                          borderRadius="full"
                          boxShadow={tab === key ? "stickerSm" : "sticker"}
                          px={4}
                          fontWeight="600"
                          fontFamily="hand"
                        >
                          {key === "quests" ? te("quests") : key === "rank" ? tr("tab") : t(key)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                    <Tabs.Content value="overview" pt={4}>
                      <Box bg="cream" border="2px dashed" borderColor="ink" borderRadius="lg" p={3}>
                        <Text fontSize="sm">{t("overviewSoon")}</Text>
                      </Box>
                    </Tabs.Content>
                    <Tabs.Content value="rank" pt={4}>
                      <RankTab />
                    </Tabs.Content>
                    {/* "Quà mỗi ngày": điểm danh + nhiệm vụ chung một tab (nút hộp quà trang chủ mở thẳng). */}
                    <Tabs.Content value="quests" pt={4}>
                      {progress ? (
                        <Stack gap={4}>
                          <CheckinStrip progress={progress} />
                          <QuestsList progress={progress} />
                        </Stack>
                      ) : (
                        <Text fontSize="sm">{t("loading")}</Text>
                      )}
                    </Tabs.Content>
                    <Tabs.Content value="account" pt={4}>
                      <AccountTab />
                    </Tabs.Content>
                  </Tabs.Root>
                </Stack>
              )}
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" color="ink" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Pill({ tone, children }: { tone: "paper" | "mint" | "sun"; children: React.ReactNode }) {
  return (
    <Badge
      bg={tone}
      color="ink"
      border="2px solid"
      borderColor="ink"
      borderRadius="full"
      px={2}
      fontFamily="hand"
      fontSize="sm"
      textTransform="none"
    >
      {children}
    </Badge>
  );
}
