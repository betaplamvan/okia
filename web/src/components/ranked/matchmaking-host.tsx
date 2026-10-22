"use client";

import { Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuSwords, LuX } from "react-icons/lu";
import { AcceptDialog } from "@/components/ranked/accept-dialog";
import { toaster } from "@/components/ui/toaster";
import { audio } from "@/game/audio/audio-manager";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { serverNow, wsClient } from "@/net/ws-client";
import { isActive, useMatchmaking } from "@/stores/matchmaking";

// Gắn một lần trong AppShell (docs/07): hộp chấp nhận trận ở bất kỳ trang nào, cửa sổ thu nhỏ
// "đang tìm" khi rời /ranked, điều hướng vào phòng khi ghép xong, toast thông báo của hàng chờ.
export function MatchmakingHost() {
  const t = useTranslations("Ranked");
  const router = useRouter();
  const pathname = usePathname();
  const search = useMatchmaking((s) => s.search);
  const matchedRoom = useMatchmaking((s) => s.matchedRoom);
  const notice = useMatchmaking((s) => s.notice);
  const { accept, decline, cancel, clearMatched } = useMatchmaking.getState();

  useEffect(() => {
    if (!matchedRoom) return;
    audio.playUi("confirm");
    router.push(`/r/${matchedRoom}`);
    clearMatched();
  }, [matchedRoom, router, clearMatched]);

  useEffect(() => {
    if (!notice) return;
    if (notice.key === "serverError") toaster.error({ title: notice.message ?? "" });
    else if (notice.key === "loadError") toaster.error({ title: t("loadError") });
    else toaster.create({ title: t(notice.key) });
  }, [notice, t]);

  useEffect(() => {
    if (search.phase === "found") audio.play("match_found", { volume: 1 });
  }, [search.phase]);

  // Đang tìm (kể cả vừa tải lại trang, trạng thái từ sessionStorage) → giữ WS mở; nối lại thì store
  // gửi `queue` khi nhận `welcome`.
  const active = isActive(search);
  useEffect(() => {
    if (active) void wsClient.connect();
  }, [active]);

  const onRanked = pathname === "/ranked";
  return (
    <>
      {search.phase === "found" ? (
        <AcceptDialog
          open
          expiresAt={search.expiresAt}
          acceptSeconds={search.acceptSeconds}
          accepted={search.accepted}
          others={search.others}
          bot={search.bot}
          onAccept={accept}
          onDecline={decline}
        />
      ) : null}
      {!onRanked && (search.phase === "searching" || search.phase === "requesting") ? (
        <SearchPill since={search.phase === "searching" ? search.since : null} onCancel={cancel} />
      ) : null}
    </>
  );
}

// Cửa sổ thu nhỏ: góc dưới phải, spinner + "Đang tìm đối thủ" + thời gian đã chờ, mở /ranked, hủy.
function SearchPill({ since, onCancel }: { since: number | null; onCancel: () => void }) {
  const t = useTranslations("Ranked");
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, []);
  const s = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <Box
      position="fixed"
      right={{ base: 3, md: 5 }}
      bottom={{ base: 3, md: 5 }}
      zIndex="toast"
      layerStyle="sticker"
      bg="paper"
      color="ink"
      px={3}
      py={2}
      maxW="calc(100vw - 24px)"
      data-testid="search-pill"
    >
      <HStack gap={3}>
        <Spinner size="sm" color="coral" />
        <Stack gap={0} minW={0}>
          <Text fontWeight="700" fontSize="sm" lineHeight="1.1">
            {t("pillSearching")}
          </Text>
          <Text fontSize="xs" opacity={0.75} fontVariantNumeric="tabular-nums">
            {mm}:{ss}
          </Text>
        </Stack>
        <Button asChild variant="sticker" size="xs" bg="sun" data-sfx="open">
          <Link href="/ranked">
            <LuSwords /> {t("pillOpen")}
          </Link>
        </Button>
        <Button
          variant="sticker"
          size="xs"
          onClick={onCancel}
          aria-label={t("cancel")}
          data-sfx="back"
          data-testid="search-pill-cancel"
        >
          <LuX />
        </Button>
      </HStack>
    </Box>
  );
}
