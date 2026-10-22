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
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  LuCalendar,
  LuCrown,
  LuFlower,
  LuPencil,
  LuPencilLine,
  LuShieldCheck,
} from "react-icons/lu";
import { AccountTab } from "@/components/auth/account-tab";
import { AvatarUpload } from "@/components/auth/avatar-upload";
import { EditProfileForm } from "@/components/auth/edit-profile-form";
import { RankEmblem } from "@/components/ranked/rank-emblem";
import { RankTab } from "@/components/ranked/rank-tab";
import { TierBadge } from "@/components/ranked/tier-badge";
import { SkinPreview } from "@/components/shop/skin-preview";
import { getSkin } from "@/game/skins/skins";
import { Link } from "@/i18n/navigation";
import { type ProfileTab, useAuth } from "@/stores/auth";

// Hồ sơ người chơi dạng hộp thoại (bố cục học noitu, docs/13 + 14): dải xanh bảng + avatar to chồng
// lên, tên giữa, hàng huy hiệu (hạng, thứ hạng BXH, ngày tham gia, loại tài khoản), hàng nút
// (Chỉnh sửa hồ sơ, ví → cửa hàng), "Tủ trưng bày" (bút + dấu ăn đang dùng + huy hiệu hạng), rồi
// tab pill Tổng quan / Hạng / Tài khoản. Điểm danh và nhiệm vụ ở hộp "Quà mỗi ngày" riêng.
export function ProfileDialog() {
  const t = useTranslations("Auth");
  const te = useTranslations("Economy");
  const tr = useTranslations("Ranked");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const user = useAuth((s) => s.user);
  const rank = useAuth((s) => s.rank);
  const progress = useAuth((s) => s.progress);
  const open = useAuth((s) => s.profileOpen);
  const tab = useAuth((s) => s.profileTab);
  const openProfile = useAuth((s) => s.openProfile);
  const closeProfile = useAuth((s) => s.closeProfile);
  const [editing, setEditing] = useState(false);

  const pen = user?.loadout?.pen ? getSkin(user.loadout.pen) : undefined;
  const box = user?.loadout?.box ? getSkin(user.loadout.box) : undefined;
  const ranked = rank && !user?.isGuest ? rank : null;

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
            <Dialog.Title srOnly>{t("profile")}</Dialog.Title>
            {/* Thân hộp cuộn (scrollBehavior="inside"). Dải xanh nằm TRONG thân để avatar chồng lên
                mép dưới của dải mà không vượt ra ngoài vùng cuộn — đặt dải ngoài thân thì phải để
                thân overflow visible, và khi đó nội dung dài (lịch sử trận) bị cắt, không cuộn được. */}
            <Dialog.Body color="ink" p={0} overflowY="auto">
              <Box
                bg="board.base"
                h="88px"
                flexShrink={0}
                borderBottom="sticker"
                bgImage="linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)"
                bgSize="24px 24px"
              />
              <Box px={6} pb={5} flexShrink={0}>
                {!user ? (
                  <Text pt={4}>{t("loading")}</Text>
                ) : (
                  <Stack gap={4}>
                    <Stack gap={2} align="center" mt="-52px">
                      <Avatar.Root
                        size="2xl"
                        w="104px"
                        h="104px"
                        border="sticker"
                        boxShadow="stickerSm"
                        bg="sun"
                        color="ink"
                        fontSize="3xl"
                      >
                        <Avatar.Fallback name={user.displayName} fontWeight="700" />
                        {user.avatarUrl ? <Avatar.Image src={user.avatarUrl} /> : null}
                      </Avatar.Root>
                      <Text
                        fontSize="2xl"
                        fontWeight="700"
                        lineHeight="1.1"
                        textAlign="center"
                        truncate
                        maxW="full"
                      >
                        {user.displayName}
                      </Text>
                      <HStack gap={2} flexWrap="wrap" justify="center">
                        {ranked ? <TierBadge rank={ranked.rank} size="sm" /> : null}
                        {ranked?.position ? (
                          <Pill tone="sun">
                            <LuCrown /> {t("positionSeason", { n: format.number(ranked.position) })}
                          </Pill>
                        ) : null}
                        <Pill tone="paper">
                          <LuCalendar /> {format.dateTime(new Date(user.createdAt), "short")}
                        </Pill>
                        {user.isGuest ? (
                          <Pill tone="paper">{t("guestBadge")}</Pill>
                        ) : (
                          <Pill tone="mint">{t("verifiedBadge")}</Pill>
                        )}
                        {user.isAdmin ? (
                          <Button
                            asChild
                            variant="sticker"
                            size="xs"
                            bg="sun"
                            onClick={closeProfile}
                            data-testid="admin-link"
                          >
                            <Link href="/admin">
                              <LuShieldCheck /> {t("adminLink")}
                            </Link>
                          </Button>
                        ) : null}
                      </HStack>
                    </Stack>

                    {editing ? (
                      <Stack gap={3}>
                        <EditProfileForm onDone={() => setEditing(false)} />
                        <Box
                          bg="cream"
                          border="2px solid"
                          borderColor="ink"
                          borderRadius="lg"
                          p={3}
                        >
                          <Text fontWeight="700" mb={2}>
                            {te("avatar")}
                          </Text>
                          <AvatarUpload />
                        </Box>
                      </Stack>
                    ) : (
                      <HStack gap={2} justify="center" flexWrap="wrap">
                        <Button
                          variant="sticker"
                          size="sm"
                          bg="sun"
                          onClick={() => setEditing(true)}
                        >
                          <LuPencilLine /> {t("editProfile")}
                        </Button>
                        {/* Ví: một nút Ruột chì ‖ Hoa điểm tốt dẫn tới cửa hàng (như trang chủ). */}
                        <Button
                          asChild
                          variant="sticker"
                          size="sm"
                          onClick={closeProfile}
                          aria-label={`${te("wallet")} — ${tc("shop")}`}
                        >
                          <Link href="/shop">
                            <HStack gap={1} title={te("lead")}>
                              <Text as="span">{format.number(user.wallet?.lead ?? 0)}</Text>
                              <LuPencil />
                            </HStack>
                            <Box w="2px" h="4" bg="ink" opacity={0.5} borderRadius="full" />
                            <HStack gap={1} title={te("flower")}>
                              <Text as="span">{format.number(user.wallet?.flower ?? 0)}</Text>
                              <LuFlower />
                            </HStack>
                          </Link>
                        </Button>
                      </HStack>
                    )}

                    {/* Tủ trưng bày: bút + dấu ăn đang trang bị, huy hiệu hạng mùa này. */}
                    <Stack gap={2}>
                      <Text fontWeight="700">{t("showcase")}</Text>
                      <SimpleGrid columns={3} gap={3}>
                        <ShowcaseSlot label={t("showcasePen")} href="/shop">
                          {pen ? <SkinPreview skin={pen} /> : null}
                        </ShowcaseSlot>
                        <ShowcaseSlot label={t("showcaseBox")} href="/shop">
                          {box ? <SkinPreview skin={box} /> : null}
                        </ShowcaseSlot>
                        <ShowcaseSlot label={tr("tab")} onClick={() => openProfile("rank")}>
                          <RankEmblem
                            rank={ranked?.rank ?? null}
                            size={64}
                            position={ranked?.position ?? null}
                          />
                        </ShowcaseSlot>
                      </SimpleGrid>
                    </Stack>

                    <Tabs.Root
                      value={tab}
                      onValueChange={(e) => openProfile(e.value as ProfileTab)}
                      variant="plain"
                      lazyMount
                    >
                      <Tabs.List gap={2} justifyContent="center" flexWrap="wrap">
                        {(["overview", "rank", "account"] as const).map((key) => (
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
                            {key === "rank" ? tr("tab") : t(key)}
                          </Tabs.Trigger>
                        ))}
                      </Tabs.List>
                      <Tabs.Content value="overview" pt={4}>
                        <Stack gap={3}>
                          <Box
                            bg="cream"
                            border="2px solid"
                            borderColor="ink"
                            borderRadius="lg"
                            p={3}
                          >
                            <Text fontWeight="700" mb={2}>
                              {t("stats")}
                            </Text>
                            <SimpleGrid columns={2} gap={2}>
                              <Stat label={t("statGames")} value={ranked?.games ?? 0} />
                              <Stat label={t("statWins")} value={ranked?.wins ?? 0} />
                              <Stat label={t("statStreak")} value={progress?.checkin.streak ?? 0} />
                              <Stat
                                label={t("statBest")}
                                value={progress?.checkin.bestStreak ?? 0}
                              />
                            </SimpleGrid>
                          </Box>
                          <Box
                            bg="cream"
                            border="2px dashed"
                            borderColor="ink"
                            borderRadius="lg"
                            p={3}
                          >
                            <Text fontSize="sm">{t("overviewSoon")}</Text>
                          </Box>
                        </Stack>
                      </Tabs.Content>
                      <Tabs.Content value="rank" pt={4}>
                        <RankTab />
                      </Tabs.Content>
                      <Tabs.Content value="account" pt={4}>
                        <AccountTab />
                      </Tabs.Content>
                    </Tabs.Root>
                  </Stack>
                )}
              </Box>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" bg="paper" border="sticker" borderRadius="full" />
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
      gap={1}
    >
      {children}
    </Badge>
  );
}

/** Ô tủ trưng bày: viền đứt, nội dung giữa, nhãn dưới; bấm dẫn tới nơi đổi (shop / tab Hạng). */
function ShowcaseSlot({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const closeProfile = useAuth((s) => s.closeProfile);
  const inner = (
    <Stack
      gap={1}
      align="center"
      justify="center"
      bg="paper"
      border="2px dashed"
      borderColor="ink"
      borderRadius="lg"
      p={2}
      minH="110px"
      cursor="pointer"
      _hover={{ bg: "cream" }}
      transition="background 0.15s"
    >
      <Box w="64px" h="64px" display="grid" placeItems="center">
        {children}
      </Box>
      <Text fontSize="xs" fontWeight="700" opacity={0.8}>
        {label}
      </Text>
    </Stack>
  );
  if (href)
    return (
      <Link href={href} onClick={closeProfile} aria-label={label}>
        {inner}
      </Link>
    );
  return (
    <Box asChild textAlign="inherit">
      <button type="button" onClick={onClick} aria-label={label}>
        {inner}
      </button>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const format = useFormatter();
  return (
    <HStack
      justify="space-between"
      bg="paper"
      border="2px solid"
      borderColor="ink"
      borderRadius="full"
      px={3}
      py={1}
    >
      <Text fontSize="sm" opacity={0.8}>
        {label}
      </Text>
      <Text fontWeight="700">{format.number(value)}</Text>
    </HStack>
  );
}
