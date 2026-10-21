"use client";

import { Box, CloseButton, Dialog, HStack, Portal, Tabs, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuCalendarCheck, LuCheck, LuGift } from "react-icons/lu";
import { CheckinStrip } from "@/components/economy/checkin-strip";
import { QuestsList } from "@/components/economy/quests-list";
import { type GiftTab, useAuth } from "@/stores/auth";

// Hộp "Quà mỗi ngày" (học noitu, docs/06): mở từ nút hộp quà trang chủ, không dính hồ sơ.
// Hai mục dạng nút chia đôi: Điểm danh (dải 7 ngày) / Nhiệm vụ (ngày + tuần). Mục nào còn thưởng
// chưa nhận thì có chấm đỏ nhỏ trên nút mục.
export function GiftDialog() {
  const t = useTranslations("Economy");
  const ta = useTranslations("Auth");
  const open = useAuth((s) => s.giftOpen);
  const tab = useAuth((s) => s.giftTab);
  const openGift = useAuth((s) => s.openGift);
  const closeGift = useAuth((s) => s.closeGift);
  const progress = useAuth((s) => s.progress);

  const dots: Record<GiftTab, boolean> = {
    checkin: !!progress?.canClaim && !progress.checkin.checkedToday,
    quests:
      !!progress?.canClaim && progress.quests.some((q) => !q.claimed && q.progress >= q.target),
  };
  const TAB_ICON = { checkin: LuCalendarCheck, quests: LuCheck } as const;

  return (
    <Dialog.Root
      placement="center"
      motionPreset="slide-in-bottom"
      size={{ mdDown: "full", md: "md" }}
      scrollBehavior="inside"
      open={open}
      lazyMount
      unmountOnExit
      onOpenChange={(e) => {
        if (!e.open) closeGift();
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
            data-testid="gift-dialog"
          >
            <Dialog.Header bg="pink" borderBottom="sticker" py={4}>
              <Dialog.Title
                fontSize="2xl"
                fontWeight="700"
                color="ink"
                display="flex"
                alignItems="center"
                gap={2}
              >
                <LuGift /> {t("dailyGift")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body color="ink" py={5}>
              <Tabs.Root
                value={tab}
                onValueChange={(e) => openGift(e.value as GiftTab)}
                variant="plain"
                lazyMount
              >
                {/* Nút chia đôi: một khung viền sticker, mục đang chọn tô mint. */}
                <Tabs.List
                  display="grid"
                  gridTemplateColumns="1fr 1fr"
                  border="sticker"
                  borderRadius="lg"
                  overflow="hidden"
                  boxShadow="stickerSm"
                >
                  {(["checkin", "quests"] as const).map((key, i) => {
                    const Icon = TAB_ICON[key];
                    return (
                      <Tabs.Trigger
                        key={key}
                        value={key}
                        position="relative"
                        justifyContent="center"
                        bg={tab === key ? "mint" : "paper"}
                        color="ink"
                        borderInlineStart={i > 0 ? "sticker" : undefined}
                        borderRadius={0}
                        py={2.5}
                        fontWeight="700"
                        fontFamily="hand"
                        fontSize="md"
                        gap={2}
                      >
                        <Icon /> {t(key)}
                        {dots[key] ? (
                          <Box
                            position="absolute"
                            top="6px"
                            right="8px"
                            w="10px"
                            h="10px"
                            bg="coral"
                            border="2px solid"
                            borderColor="ink"
                            borderRadius="full"
                          />
                        ) : null}
                      </Tabs.Trigger>
                    );
                  })}
                </Tabs.List>
                <Tabs.Content value="checkin" pt={4}>
                  {progress ? (
                    <CheckinStrip progress={progress} />
                  ) : (
                    <Text fontSize="sm">{ta("loading")}</Text>
                  )}
                </Tabs.Content>
                <Tabs.Content value="quests" pt={4}>
                  {progress ? (
                    <QuestsList progress={progress} />
                  ) : (
                    <Text fontSize="sm">{ta("loading")}</Text>
                  )}
                </Tabs.Content>
              </Tabs.Root>
            </Dialog.Body>
            <HStack position="absolute" top={3} right={3}>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" bg="paper" border="sticker" borderRadius="full" />
              </Dialog.CloseTrigger>
            </HStack>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
