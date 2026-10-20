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
import { LuPencil, LuPencilLine } from "react-icons/lu";
import { AccountTab } from "@/components/auth/account-tab";
import { EditProfileForm } from "@/components/auth/edit-profile-form";
import { type ProfileTab, useAuth } from "@/stores/auth";

// Hồ sơ người chơi dạng hộp thoại (học từ noitu): đầu trang là avatar + tên + huy hiệu,
// hàng nút "Chỉnh sửa hồ sơ" / Ruột chì, rồi các tab Tổng quan / Tài khoản.
export function ProfileDialog() {
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const user = useAuth((s) => s.user);
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
                        ) : user.emailVerified ? (
                          <Pill tone="mint">{t("verifiedBadge")}</Pill>
                        ) : (
                          <Pill tone="sun">{t("unverifiedBadge")}</Pill>
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
                    <EditProfileForm onDone={() => setEditing(false)} />
                  ) : (
                    <HStack gap={2} justify="center" flexWrap="wrap">
                      <Button variant="sticker" size="sm" bg="sun" onClick={() => setEditing(true)}>
                        <LuPencilLine /> {t("editProfile")}
                      </Button>
                      <Button variant="sticker" size="sm" disabled title={tc("lead")}>
                        <LuPencil /> 0 {tc("lead")}
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
                      {(["overview", "account"] as const).map((key) => (
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
                          {t(key)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                    <Tabs.Content value="overview" pt={4}>
                      <Box bg="cream" border="2px dashed" borderColor="ink" borderRadius="lg" p={4}>
                        <Text>{t("overviewSoon")}</Text>
                      </Box>
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
