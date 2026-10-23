"use client";

import {
  Box,
  Button,
  Container,
  Grid,
  Heading,
  HStack,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuSwords, LuTrophy, LuX } from "react-icons/lu";
import { RankCard } from "@/components/ranked/rank-card";
import { TierLadder } from "@/components/ranked/tier-ladder";
import { Link, useRouter } from "@/i18n/navigation";
import { serverNow, useConnection, wsClient } from "@/net/ws-client";
import { useAuth } from "@/stores/auth";
import { useMatchmaking, type Search } from "@/stores/matchmaking";

// Màn xếp hạng /ranked (P2-07): thẻ hạng của tôi → "Tìm trận" → chờ (thời gian, báo khi mở rộng
// phạm vi). Trạng thái tìm nằm trong store toàn cục (stores/matchmaking): rời trang vẫn tìm, hộp
// chấp nhận và điều hướng vào phòng do MatchmakingHost (AppShell) lo.
export function RankedScreen() {
  const t = useTranslations("Ranked");
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const rank = useAuth((s) => s.rank);
  const loadRank = useAuth((s) => s.loadRank);
  const openProfile = useAuth((s) => s.openProfile);
  const status = useConnection((s) => s.status);
  const activeRoomId = useConnection((s) => s.activeRoomId);
  const search = useMatchmaking((s) => s.search);
  const find = useMatchmaking((s) => s.find);
  const cancel = useMatchmaking((s) => s.cancel);
  const declineMatch = useMatchmaking((s) => s.decline);

  // Kết nối WS sớm (để nhận welcome.activeRoomId) và tải hạng khi biết người dùng.
  useEffect(() => {
    void wsClient.connect();
  }, []);
  useEffect(() => {
    if (user) void loadRank();
  }, [user, loadRank]);

  // Đang dở trận (hoặc vừa được ghép ở tab khác) → vào lại.
  useEffect(() => {
    if (activeRoomId) router.replace(`/r/${activeRoomId}`);
  }, [activeRoomId, router]);

  const guest = !!user?.isGuest;

  return (
    <Container maxW="4xl" px={4} py={{ base: 4, md: 6 }} flex="1">
      <Stack gap={{ base: 4, md: 5 }}>
        <Stack gap={1}>
          <Heading size="3xl" color="cream" textShadow="stickerText" textAlign="center">
            {t("title")}
          </Heading>
          <Text textAlign="center" color="cream" opacity={0.9}>
            {t("intro")}
          </Text>
        </Stack>

        <Grid
          templateColumns={{ base: "1fr", md: "3fr 2fr" }}
          gap={{ base: 4, md: 5 }}
          alignItems="start"
        >
          <Stack layerStyle="sticker" p={5} gap={4}>
            {guest ? (
              <Stack gap={3}>
                <Heading size="xl" color="ink">
                  {t("guestTitle")}
                </Heading>
                <Text>{t("guestBody")}</Text>
                <Button variant="sticker" bg="mint" onClick={() => openProfile("account")}>
                  {t("signIn")}
                </Button>
              </Stack>
            ) : rank ? (
              <RankCard rank={rank} />
            ) : (
              <Text>…</Text>
            )}

            {search.phase === "idle" ? (
              <Button
                variant="sticker"
                bg="coral"
                size="lg"
                disabled={guest || status === "offline"}
                onClick={() => void find()}
                data-sfx="confirm"
                data-testid="find-match"
              >
                <LuSwords /> {t("find")}
              </Button>
            ) : search.phase === "found" ? (
              <SearchingBox
                search={{
                  phase: "searching",
                  since: search.since,
                  waiting: 1,
                  online: 1,
                  widened: false,
                }}
                onCancel={declineMatch}
              />
            ) : (
              <SearchingBox search={search} onCancel={cancel} />
            )}
          </Stack>

          <Stack gap={4}>
            <Stack layerStyle="sticker" p={5} gap={2}>
              <Heading size="lg" color="ink">
                {t("howTitle")}
              </Heading>
              {(["how1", "how2", "how3", "how4"] as const).map((k) => (
                <Text key={k} fontSize="sm">
                  • {t(k)}
                </Text>
              ))}
              <Button asChild variant="sticker" size="sm" bg="sun" mt={1}>
                <Link href="/leaderboard">
                  <LuTrophy /> {t("leaderboardLink")}
                </Link>
              </Button>
            </Stack>
            {status === "offline" ? (
              <Text textAlign="center" color="sun" role="status">
                {t("loadError")}
              </Text>
            ) : null}
          </Stack>
        </Grid>

        {/* Các bậc hạng + huy hiệu từng bậc; đánh dấu hạng hiện tại. */}
        <TierLadder rank={rank?.rank} />
      </Stack>
    </Container>
  );
}

// Hộp đang tìm: spinner, đã chờ bao lâu (giờ server), cảnh báo mở rộng, hủy. (Không hiện số người chờ.)
function SearchingBox({
  search,
  onCancel,
}: {
  search: Extract<Search, { phase: "searching" | "requesting" }>;
  onCancel: () => void;
}) {
  const t = useTranslations("Ranked");
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, []);
  const waited =
    search.phase === "searching" ? Math.max(0, Math.floor((now - search.since) / 1000)) : 0;
  return (
    <Stack
      gap={3}
      align="center"
      bg="cream"
      border="2px solid"
      borderColor="ink"
      borderRadius="lg"
      p={4}
      role="status"
      data-testid="searching"
    >
      <HStack gap={3}>
        <Spinner size="md" color="ink" borderWidth="3px" />
        <Text fontWeight="700" fontSize="lg">
          {t("searching")}
        </Text>
      </HStack>
      <Text fontSize="sm">{t("waited", { s: String(waited) })}</Text>
      {/* Số người chờ / online cố ý không hiện (2026-10-22): lúc ít người trông nản. */}
      <Box
        fontSize="sm"
        bg={search.phase === "searching" && search.widened ? "sun" : "paper"}
        border="2px solid"
        borderColor="ink"
        borderRadius="md"
        px={2}
        py={1}
        textAlign="center"
      >
        {search.phase === "searching" && search.widened ? t("widened") : t("widenHint")}
      </Box>
      <Button variant="sticker" size="sm" bg="paper" onClick={onCancel} data-sfx="back">
        <LuX /> {t("cancel")}
      </Button>
    </Stack>
  );
}
