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
import { useEffect, useRef, useState } from "react";
import { LuSwords, LuTrophy, LuX } from "react-icons/lu";
import { AcceptDialog } from "@/components/ranked/accept-dialog";
import { RankCard } from "@/components/ranked/rank-card";
import { toaster } from "@/components/ui/toaster";
import { audio } from "@/game/audio/audio-manager";
import type { ServerMsg } from "@/game/ws-types";
import { Link, useRouter } from "@/i18n/navigation";
import { serverNow, useConnection, wsClient } from "@/net/ws-client";
import { useAuth } from "@/stores/auth";

type Search =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "searching"; since: number; waiting: number; online: number; widened: boolean }
  /** Đã ghép, chờ cả hai chấp nhận (docs/07 — Chấp nhận trận). */
  | {
      phase: "found";
      matchId: string;
      expiresAt: number;
      acceptSeconds: number;
      since: number;
      accepted: boolean;
      others: number;
    };

// Màn xếp hạng /ranked (P2-07): thẻ hạng của tôi → "Tìm trận" → chờ (thời gian, số người chờ/online,
// báo khi mở rộng phạm vi) → `matched` → vào phòng /r/<id> (cùng màn chơi với phòng riêng).
export function RankedScreen() {
  const t = useTranslations("Ranked");
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const rank = useAuth((s) => s.rank);
  const loadRank = useAuth((s) => s.loadRank);
  const openProfile = useAuth((s) => s.openProfile);
  const status = useConnection((s) => s.status);
  const activeRoomId = useConnection((s) => s.activeRoomId);
  const [search, setSearch] = useState<Search>({ phase: "idle" });
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

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

  // Lắng nghe server trong lúc tìm; rời trang / hủy → queue_cancel. Effect chỉ phụ thuộc vào
  // "đang tìm hay không" (không phải từng phase) để requesting → searching không gửi queue_cancel.
  const active =
    search.phase === "searching" || search.phase === "requesting" || search.phase === "found";
  useEffect(() => {
    if (!active) return;
    const off = wsClient.subscribe((m: ServerMsg) => {
      const cur = searchRef.current;
      switch (m.t) {
        case "queued":
          setSearch({ phase: "searching", since: m.since, waiting: 1, online: 1, widened: false });
          return;
        case "queue_status":
          if (cur.phase === "searching")
            setSearch({
              ...cur,
              waiting: m.waiting,
              online: m.online,
              widened: m.widened ?? false,
            });
          return;
        case "match_found":
          audio.play("notify", { volume: 0.9 });
          setSearch({
            phase: "found",
            matchId: m.matchId,
            expiresAt: m.expiresAt,
            acceptSeconds: m.acceptSeconds,
            since: cur.phase === "searching" ? cur.since : serverNow(),
            accepted: false,
            others: 0,
          });
          return;
        case "match_update":
          if (cur.phase === "found" && cur.matchId === m.matchId)
            setSearch({ ...cur, others: m.accepted - (cur.accepted ? 1 : 0) });
          return;
        case "match_cancelled":
          // Người kia từ chối / hết giờ → server đã trả ta về hàng chờ và gửi `queued` ngay sau.
          if (m.requeued) {
            toaster.create({ title: m.byMe ? t("cancelTimeout") : t("cancelOther") });
          } else {
            audio.playUi("back");
            setSearch({ phase: "idle" });
            if (m.reason === "timeout") toaster.create({ title: t("cancelTimeout") });
          }
          return;
        case "matched":
          // Về idle ngay (trang này vẫn sống trong <Activity> khi sang phòng; quay lại là tìm tiếp được).
          audio.playUi("confirm");
          setSearch({ phase: "idle" });
          router.push(`/r/${m.roomId}`);
          return;
        case "welcome":
          // Nối lại giữa chừng: server đã bỏ ta khỏi hàng chờ khi rớt → vào lại.
          wsClient.send({ t: "queue", mode: "ranked" });
          return;
        case "error":
          if (m.ref !== "queue") return;
          setSearch({ phase: "idle" });
          if (m.code === "GUEST_NOT_ALLOWED" || m.code === "EMAIL_NOT_VERIFIED") {
            openProfile("account");
          } else if (m.code === "ALREADY_IN_GAME") {
            toaster.create({ title: t("inGame") });
          } else {
            toaster.error({ title: m.message });
          }
          return;
        default:
          return;
      }
    });
    return () => {
      off();
      // Đã được ghép thì server đã bỏ ta khỏi hàng chờ; gửi hủy lúc này vô hại. Đang có trận chờ
      // chấp nhận thì hủy tìm = từ chối.
      wsClient.send({ t: "queue_cancel" });
    };
  }, [active, router, openProfile, t]);

  async function find() {
    setSearch({ phase: "requesting" });
    await wsClient.connect();
    if (!wsClient.send({ t: "queue", mode: "ranked" })) {
      setSearch({ phase: "idle" });
      toaster.error({ title: t("loadError") });
    }
  }

  function cancel() {
    setSearch({ phase: "idle" });
  }

  function acceptMatch() {
    if (search.phase !== "found") return;
    wsClient.send({ t: "match_accept", matchId: search.matchId });
    setSearch({ ...search, accepted: true });
  }

  function declineMatch() {
    if (search.phase !== "found") return;
    wsClient.send({ t: "match_decline", matchId: search.matchId });
    setSearch({ phase: "idle" });
  }

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
                onClick={find}
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
      </Stack>

      {/* Chỉ mount khi đang có trận chờ: gỡ hẳn khỏi DOM (kể cả Portal) trước khi sang phòng, vì trang
          này bị <Activity> ẩn khi điều hướng và animation đóng sẽ không bao giờ chạy xong. */}
      {search.phase === "found" ? (
        <AcceptDialog
          open
          expiresAt={search.expiresAt}
          acceptSeconds={search.acceptSeconds}
          accepted={search.accepted}
          others={search.others}
          onAccept={acceptMatch}
          onDecline={declineMatch}
        />
      ) : null}
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
