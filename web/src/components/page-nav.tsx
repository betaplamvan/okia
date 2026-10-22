"use client";

import { Box, Button, HStack, Icon, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { LuArrowLeft, LuChevronRight } from "react-icons/lu";
import { usePathname, useRouter } from "@/i18n/navigation";

// Điều hướng trang con (học noitu, docs/14): header có breadcrumb "logo › tên trang", bên trái nội
// dung có nút "Quay lại". Trang chủ không có cả hai.

/** Tên trang theo đoạn đầu của đường dẫn — dùng lại tiêu đề sẵn có của từng trang. */
const TITLES = {
  play: "Play.title",
  ranked: "Ranked.title",
  room: "Room.title",
  r: "Room.title", // link mời /r/{code}
  leaderboard: "Leaderboard.title",
  shop: "Shop.title",
  about: "About.title",
  privacy: "Privacy.title",
  terms: "Terms.title",
  admin: "Admin.title",
} as const;

function useSection(): { home: boolean; title: string | null } {
  const t = useTranslations();
  const segment = usePathname().split("/")[1] ?? "";
  if (!segment) return { home: true, title: null };
  if (segment === "dev") return { home: false, title: null };
  const key = TITLES[segment as keyof typeof TITLES] ?? "NotFound.title";
  return { home: false, title: t(key) };
}

export function PageBreadcrumb() {
  const t = useTranslations("Nav");
  const { home, title } = useSection();
  if (home || !title) return null;
  return (
    <HStack as="nav" aria-label={t("breadcrumb")} gap={{ base: 1, md: 2 }} minW={0} color="paper">
      <Icon flexShrink={0} opacity={0.6} boxSize={{ base: 3.5, md: 4 }}>
        <LuChevronRight />
      </Icon>
      <Text
        aria-current="page"
        fontSize={{ base: "md", md: "lg" }}
        fontWeight="700"
        opacity={0.9}
        truncate
      >
        {title}
      </Text>
    </HStack>
  );
}

// Đã chuyển trang trong app ít nhất một lần → "Quay lại" lùi lịch sử; vào thẳng bằng link (mời
// phòng, chia sẻ, quay về từ Google) thì không có trang trước thuộc app → về trang chủ.
let navigatedInApp = false;

export function BackButton() {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const prev = useRef(pathname);
  const { home } = useSection();

  useEffect(() => {
    if (prev.current !== pathname) {
      navigatedInApp = true;
      prev.current = pathname;
    }
  }, [pathname]);

  if (home) return null;
  return (
    // Sát mép trái như noitu. < xl: một hàng gọn trên nội dung; xl+: nổi bên cạnh nội dung (khung
    // 4xl ở giữa còn đủ lề trái), không đẩy nội dung xuống.
    <Box
      px={4}
      pb={{ base: 2, xl: 0 }}
      position={{ xl: "absolute" }}
      top={{ xl: 3 }}
      left={{ xl: 0 }}
      zIndex={1}
    >
      <Button
        variant="sticker"
        size="sm"
        data-sfx="back"
        onClick={() => (navigatedInApp ? router.back() : router.push("/"))}
      >
        <LuArrowLeft /> {t("back")}
      </Button>
    </Box>
  );
}
