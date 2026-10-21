"use client";

import { Avatar, Box, Button, HStack, IconButton, Text } from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect } from "react";
import { LuFlower, LuGift, LuPencil } from "react-icons/lu";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/stores/auth";

// Hàng nút dưới bảng hiệu (học noitu.fun, docs/14): ba nút sticker rời nhau —
//  1. hồ sơ: avatar + tên → mở hộp hồ sơ;
//  2. ví: Ruột chì | Hoa điểm tốt trên một nút vàng → cửa hàng (nơi tiêu tiền);
//  3. quà mỗi ngày: hộp quà → hộp "Quà mỗi ngày" riêng (điểm danh / nhiệm vụ), chấm đỏ khi còn thưởng.
// Dữ liệu từ store xác thực (/me); chưa tải xong thì hiện "Khách".
export function PlayerPill() {
  const t = useTranslations("Common");
  const ta = useTranslations("Auth");
  const te = useTranslations("Economy");
  const format = useFormatter();
  const user = useAuth((s) => s.user);
  const progress = useAuth((s) => s.progress);
  const openProfile = useAuth((s) => s.openProfile);
  const openGift = useAuth((s) => s.openGift);
  const loadProgress = useAuth((s) => s.loadProgress);

  // Tải tiến trình để biết có quà chưa nhận (khách không nhận được thưởng → khỏi tải).
  const canLoad = !!user && !user.isGuest;
  useEffect(() => {
    if (canLoad) void loadProgress();
  }, [canLoad, loadProgress]);

  const hasGift =
    !!progress?.canClaim &&
    (!progress.checkin.checkedToday ||
      progress.quests.some((q) => !q.claimed && q.progress >= q.target));

  return (
    <HStack justify="center" gap={3} flexWrap="wrap">
      <Button
        variant="sticker"
        h="auto"
        px={2}
        py={1}
        maxW="full"
        aria-label={ta("profile")}
        onClick={() => openProfile("overview")}
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
        </HStack>
      </Button>

      <Button
        asChild
        variant="sticker"
        bg="sun"
        h="auto"
        px={3}
        py={2}
        aria-label={`${te("wallet")} — ${t("shop")}`}
        data-testid="wallet-pill"
      >
        <Link href="/shop">
          <HStack gap={2} fontWeight="700">
            <HStack gap={1} title={te("lead")}>
              <Text as="span">{format.number(user?.wallet?.lead ?? 0)}</Text>
              <LuPencil />
            </HStack>
            <Box w="2px" h="5" bg="ink" opacity={0.5} borderRadius="full" />
            <HStack gap={1} title={te("flower")}>
              <Text as="span">{format.number(user?.wallet?.flower ?? 0)}</Text>
              <LuFlower />
            </HStack>
          </HStack>
        </Link>
      </Button>

      <Box position="relative">
        <IconButton
          variant="sticker"
          bg="pink"
          size="lg"
          aria-label={te("dailyGift")}
          onClick={() => openGift()}
          data-testid="gift-pill"
        >
          <LuGift />
        </IconButton>
        {hasGift ? (
          <Box
            position="absolute"
            top="-6px"
            right="-6px"
            w="16px"
            h="16px"
            bg="coral"
            border="2px solid"
            borderColor="ink"
            borderRadius="full"
            pointerEvents="none"
            data-testid="gift-dot"
          />
        ) : null}
      </Box>
    </HStack>
  );
}
