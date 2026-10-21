"use client";

import {
  Box,
  Button,
  CloseButton,
  Container,
  Dialog,
  Heading,
  HStack,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LuCheck, LuCopy, LuFlag, LuShare2, LuUser, LuWifiOff } from "react-icons/lu";
import { BoardCanvas } from "@/components/play/board-canvas";
import { GameLayout } from "@/components/play/game-layout";
import { useMapName } from "@/components/play/map-picker";
import { PlayerChip } from "@/components/play/player-chip";
import { useGameSounds } from "@/components/play/use-game-sounds";
import { RewardChips } from "@/components/economy/wallet-chips";
import { RankEmblem } from "@/components/ranked/rank-emblem";
import { TierBadge } from "@/components/ranked/tier-badge";
import { seatSkins } from "@/game/skins/skins";
import { toaster } from "@/components/ui/toaster";
import { audio } from "@/game/audio/audio-manager";
import type { GameResult } from "@/game/controller";
import { NetworkController, type NetworkEvent } from "@/game/network-controller";
import type { RendererEvent } from "@/game/renderer/board-renderer";
import { Link, useRouter } from "@/i18n/navigation";
import { serverNow, useConnection, wsClient } from "@/net/ws-client";
import { TIERS } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Màn phòng online /r/[code] (P1-19, P1-20, P2-08): phòng riêng (chờ bạn với mã + link mời) hoặc
// trận xếp hạng (vào thẳng, có huy hiệu hạng và điểm hạng ± sau trận) → chơi (timer, trạng thái
// đối thủ) → kết quả. Một NetworkController cho mỗi lần mount; WS client là singleton của tab.
export function RoomScreen({ code }: { code: string }) {
  const t = useTranslations("Room");
  const tr = useTranslations("Ranked");
  const tp = useTranslations("Play");
  const tm = useTranslations("Maps");
  const mapName = useMapName();
  const locale = useLocale();
  const router = useRouter();
  const [fatal, setFatal] = useState<string | null>(null);
  const [resignOpen, setResignOpen] = useState(false);
  const [settled, setSettled] = useState<GameResult | null>(null);
  const [controller] = useState(
    () =>
      new NetworkController(wsClient, code, (e: NetworkEvent) => {
        if (e.type === "error") {
          if (
            e.code === "ROOM_NOT_FOUND" ||
            e.code === "ROOM_FULL" ||
            e.code === "ALREADY_IN_GAME"
          ) {
            setFatal(e.message);
          } else if (e.ref === "move") {
            audio.playUi("error");
          } else {
            toaster.error({ title: e.message });
          }
        }
      }),
  );

  useEffect(() => {
    controller.start();
    return () => controller.destroy();
  }, [controller]);

  const subscribe = useCallback((l: () => void) => controller.subscribe(l), [controller]);
  const getSession = useCallback(() => controller.getSession(), [controller]);
  const session = useSyncExternalStore(subscribe, getSession, getSession);
  const connection = useConnection((s) => s.status);
  const loadouts = session.online?.loadouts;
  const skins = useMemo(
    () => seatSkins(loadouts?.[0], loadouts?.[1]),
    // Chỉ đổi khi id skin đổi (loadouts là mảng mới mỗi room_state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadouts?.[0]?.pen, loadouts?.[0]?.box, loadouts?.[1]?.pen, loadouts?.[1]?.box],
  );
  useGameSounds(session, skins);

  const onSelectEdge = useCallback((edge: number) => controller.play(edge), [controller]);
  const onRendererEvent = useCallback((e: RendererEvent) => {
    if (e.type === "count") audio.playCount(e.n);
    else setSettled(e.result);
  }, []);
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const comboLabel = useCallback(
    (n: number) => tp("combo", { n: numberFormat.format(n) }),
    [tp, numberFormat],
  );

  const { state, human, bot, result, online } = session;
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setSettled(result), 4000);
    return () => clearTimeout(id);
  }, [result]);
  const ranked = online?.mode === "ranked";
  // Trận xếp hạng xong → ví (Ruột chì) và hạng trong store đã cũ → tải lại.
  useEffect(() => {
    if (!result || !ranked) return;
    const s = useAuth.getState();
    void s.loadProgress();
    void s.loadRank();
  }, [result, ranked]);

  // Rời phòng → về sảnh phòng riêng hoặc màn xếp hạng.
  const leave = () => {
    controller.leave();
    router.push(ranked ? "/ranked" : "/room");
  };

  if (fatal) {
    return (
      <Centered>
        <Text fontSize="xl">{fatal}</Text>
        <Button asChild variant="sticker" bg="mint">
          <Link href="/room">{t("errorBack")}</Link>
        </Button>
      </Centered>
    );
  }

  if (!online || online.status === "connecting") {
    return (
      <Centered>
        <Text role="status">{connection === "offline" ? t("reconnecting") : t("connecting")}</Text>
      </Centered>
    );
  }

  if (online.status === "waiting") {
    return <WaitingRoom code={code} onCancel={leave} />;
  }

  const myName = online.names[human] ?? tp("you");
  const theirName = online.names[bot] ?? "…";
  const yourTurn = state.turn === human && !result;
  const resultTitle = result
    ? result.winner === null
      ? t("resultDraw")
      : result.winner === human
        ? t("resultWin")
        : t("resultLose", { name: theirName })
    : "";
  const resultTone = result?.winner === human ? "mint" : result?.winner === null ? "sun" : "coral";
  const loserName = result?.winner === null ? "" : result?.winner === human ? theirName : myName;
  const rk = result?.ranked ?? null;
  const myDelta = rk ? rk.pointsDelta[human] : 0;
  const myRankAfter = rk ? rk.ranks[human] : null;
  const myRankBefore = online.ranks[human];
  const tierShift =
    myRankAfter && myRankBefore
      ? TIERS.indexOf(myRankAfter.tier) - TIERS.indexOf(myRankBefore.tier)
      : 0;

  return (
    <Container maxW="6xl" px={{ base: 2, md: 4 }} py={{ base: 2, md: 4 }} flex="1">
      <GameLayout
        me={
          <PlayerChip
            icon={<LuUser />}
            name={myName}
            score={numberFormat.format(state.scores[human])}
            tone={human === 0 ? "pen.blue" : "pen.red"}
            active={yourTurn}
            sub={ranked ? <TierBadge rank={online.ranks[human]} size="sm" /> : undefined}
          />
        }
        opponent={
          <PlayerChip
            icon={<LuUser />}
            name={theirName}
            score={numberFormat.format(state.scores[bot])}
            tone={bot === 0 ? "pen.blue" : "pen.red"}
            active={!yourTurn && !result}
            reverse
            sub={ranked ? <TierBadge rank={online.ranks[bot]} size="sm" /> : undefined}
          />
        }
        status={
          <Box textAlign="center" color="cream" fontWeight="600" minH="6" role="status">
            {result
              ? resultTitle
              : connection !== "online"
                ? t("reconnecting")
                : yourTurn
                  ? t("yourTurn")
                  : t("theirTurn", { name: theirName })}
            {!result && !online.opponentOnline ? (
              <HStack as="span" justify="center" gap={1} color="sun" fontSize="sm">
                <LuWifiOff /> {t("opponentOffline")}
              </HStack>
            ) : null}
            {session.combo >= 2 && !result ? (
              <Text as="span" display="block" color="sun" fontSize="xl" fontWeight="700">
                {comboLabel(session.combo)}
              </Text>
            ) : null}
          </Box>
        }
        board={
          <>
            {online.turnSeconds ? (
              <TurnTimer
                deadline={result ? null : online.deadline}
                turnSeconds={online.turnSeconds}
                tone={
                  state.turn === human
                    ? human === 0
                      ? "pen.blue"
                      : "pen.red"
                    : bot === 0
                      ? "pen.blue"
                      : "pen.red"
                }
                label={t("timeLeft")}
              />
            ) : null}
            <BoardCanvas
              session={session}
              onSelectEdge={onSelectEdge}
              onEvent={onRendererEvent}
              twoTapTouch={Math.max(state.rows, state.cols) >= 7}
              label={tp("board")}
              comboLabel={comboLabel}
              skins={skins}
            />
          </>
        }
        controls={
          <Stack gap={2} align="center">
            <Button
              variant="sticker"
              size="sm"
              bg="coral"
              disabled={!!result}
              onClick={() => setResignOpen(true)}
            >
              <LuFlag /> {tp("resign")}
            </Button>
            <Text textAlign="center" color="cream" fontWeight="700" data-testid="map-name">
              {tm("current", { name: mapName(session.mapId) })}
            </Text>
            <Text textAlign="center" color="cream" opacity={0.7} fontSize="sm">
              {ranked ? (
                t("rankedCode")
              ) : (
                <>
                  {t("codeLabel")}: <b>{code}</b>
                </>
              )}
            </Text>
          </Stack>
        }
      />

      <Dialog.Root
        role="alertdialog"
        placement="center"
        open={resignOpen}
        onOpenChange={(e) => setResignOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
          <Dialog.Positioner px={4}>
            <Dialog.Content layerStyle="sticker" p={0} overflow="hidden">
              <Dialog.Header bg="coral" borderBottom="sticker">
                <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                  {tp("resignTitle")}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" fontSize="lg" py={5}>
                {tp("resignBody")}
              </Dialog.Body>
              <Dialog.Footer pb={5} gap={3}>
                <Button variant="sticker" onClick={() => setResignOpen(false)}>
                  {tp("cancel")}
                </Button>
                <Button
                  variant="sticker"
                  bg="coral"
                  onClick={() => {
                    controller.resign();
                    setResignOpen(false);
                  }}
                >
                  {tp("confirmResign")}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" color="ink" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={!!result && settled === result}
      >
        <Portal>
          <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
          <Dialog.Positioner px={4}>
            <Dialog.Content layerStyle="sticker" p={0} overflow="hidden" textAlign="center">
              <Dialog.Header bg={resultTone} borderBottom="sticker" justifyContent="center">
                <Dialog.Title fontSize="3xl" fontWeight="700" color="ink">
                  {resultTitle}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" py={6}>
                <Text fontSize="5xl" fontWeight="700" lineHeight="1">
                  {numberFormat.format(state.scores[human])} –{" "}
                  {numberFormat.format(state.scores[bot])}
                </Text>
                <Text mt={2} opacity={0.8}>
                  {result ? t(`reason.${result.reason}`, { name: loserName }) : ""}
                </Text>
                {ranked ? (
                  <Stack
                    mt={4}
                    gap={2}
                    align="center"
                    bg="cream"
                    border="2px solid"
                    borderColor="ink"
                    borderRadius="lg"
                    p={3}
                    data-testid="ranked-result"
                  >
                    {rk ? (
                      <>
                        <Text fontSize="sm" fontWeight="700" opacity={0.8}>
                          {tr("deltaTitle")}
                        </Text>
                        <Text
                          fontSize="4xl"
                          fontWeight="700"
                          lineHeight="1"
                          color={myDelta >= 0 ? "ink" : "pen.red"}
                          data-testid="points-delta"
                        >
                          {myDelta >= 0 ? "+" : ""}
                          {numberFormat.format(myDelta)}
                        </Text>
                        {/* Khiên mới: lên hạng bật lên + sao, rớt hạng trượt xuống mờ dần. */}
                        <Box
                          display="flex"
                          css={{
                            animation:
                              tierShift > 0
                                ? "okiaRankUp 0.7s cubic-bezier(.34,1.56,.64,1) both"
                                : tierShift < 0
                                  ? "okiaRankDown 0.6s ease-out both"
                                  : undefined,
                            "@keyframes okiaRankUp": {
                              "0%": { transform: "scale(0.5) rotate(-8deg)", opacity: 0 },
                              "60%": { transform: "scale(1.15) rotate(3deg)", opacity: 1 },
                              "100%": { transform: "scale(1) rotate(0)", opacity: 1 },
                            },
                            "@keyframes okiaRankDown": {
                              "0%": { transform: "translateY(-14px)", opacity: 0 },
                              "100%": { transform: "translateY(0)", opacity: 1 },
                            },
                            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                          }}
                        >
                          <RankEmblem rank={myRankAfter} size={112} />
                        </Box>
                        <HStack gap={2} flexWrap="wrap" justify="center">
                          <TierBadge rank={myRankAfter} size="md" showPoints />
                          {tierShift > 0 ? (
                            <Text as="span" fontWeight="700" color="pen.blue">
                              ↑ {tr("tierUp")}
                            </Text>
                          ) : tierShift < 0 ? (
                            <Text as="span" fontWeight="700" color="pen.red">
                              ↓ {tr("tierDown")}
                            </Text>
                          ) : null}
                        </HStack>
                        {!myRankAfter ? (
                          <Text fontSize="sm">
                            {tr("placement", { n: String(rk.placementLeft[human]) })}
                          </Text>
                        ) : null}
                        {result?.winner === human ? (
                          (rk.rewards[human]?.lead ?? 0) > 0 ? (
                            <RewardChips reward={rk.rewards[human]} />
                          ) : (
                            <Text fontSize="sm" opacity={0.8}>
                              {tr("noReward")}
                            </Text>
                          )
                        ) : null}
                      </>
                    ) : (
                      <Text fontSize="sm">{tr("notSettled")}</Text>
                    )}
                  </Stack>
                ) : null}
              </Dialog.Body>
              <Dialog.Footer pb={5} gap={3} justifyContent="center">
                <Button asChild variant="sticker">
                  <Link href="/">{t("backHome")}</Link>
                </Button>
                <Button variant="sticker" bg="mint" onClick={leave}>
                  {ranked ? t("backRanked") : t("backLobby")}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Container>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Container maxW="md" px={4} py={10} flex="1">
      <Stack layerStyle="sticker" p={6} gap={4} textAlign="center" align="center">
        {children}
      </Stack>
    </Container>
  );
}

// Phòng chờ: mã to, sao chép mã / link, chia sẻ (Web Share API), hủy.
function WaitingRoom({ code, onCancel }: { code: string; onCancel: () => void }) {
  const t = useTranslations("Room");
  const locale = useLocale();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${locale === "vi" ? "" : `/${locale}`}/r/${code}`;

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(kind === "code" ? code : link);
      setCopied(kind);
      audio.playUi("confirm");
    } catch {
      toaster.error({ title: t("noConnection") });
    }
  }

  async function share() {
    const data = { title: t("inviteTitle", { code }), text: t("shareText", { code }), url: link };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copy("link");
  }

  return (
    <Container maxW="md" px={4} py={{ base: 6, md: 10 }} flex="1">
      <Stack layerStyle="sticker" p={6} gap={4} textAlign="center" align="center">
        <Heading size="2xl" color="ink">
          {t("waitingTitle")}
        </Heading>
        <Text>{t("shareHint")}</Text>
        <Box
          bg="sun"
          border="sticker"
          borderRadius="lg"
          px={6}
          py={3}
          fontSize="4xl"
          fontWeight="700"
          letterSpacing="6px"
          fontFamily="mono"
          data-testid="room-code"
          aria-label={t("codeLabel")}
        >
          {code}
        </Box>
        <HStack gap={2} flexWrap="wrap" justify="center">
          <Button
            variant="sticker"
            size="sm"
            bg={copied === "code" ? "mint" : "paper"}
            onClick={() => copy("code")}
          >
            {copied === "code" ? <LuCheck /> : <LuCopy />}{" "}
            {copied === "code" ? t("copied") : t("copyCode")}
          </Button>
          <Button
            variant="sticker"
            size="sm"
            bg={copied === "link" ? "mint" : "paper"}
            onClick={() => copy("link")}
          >
            {copied === "link" ? <LuCheck /> : <LuCopy />}{" "}
            {copied === "link" ? t("copied") : t("copyLink")}
          </Button>
          <Button variant="sticker" size="sm" bg="mint" onClick={share}>
            <LuShare2 /> {t("shareLink")}
          </Button>
        </HStack>
        <Text fontSize="sm" opacity={0.7} wordBreak="break-all">
          {link}
        </Text>
        <Button variant="sticker" size="sm" bg="coral" onClick={onCancel}>
          {t("cancelRoom")}
        </Button>
      </Stack>
    </Container>
  );
}

// Thanh đếm giờ lượt: đọc deadline (giờ server) mỗi 200 ms; đổi màu theo người đang đi.
function TurnTimer({
  deadline,
  turnSeconds,
  tone,
  label,
}: {
  deadline: number | null;
  turnSeconds: number;
  tone: string;
  label: string;
}) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, []);
  const remaining = deadline ? Math.max(0, deadline - now) : turnSeconds * 1000;
  const pct = Math.min(100, (remaining / (turnSeconds * 1000)) * 100);
  const secs = Math.ceil(remaining / 1000);
  return (
    <HStack gap={2} mb={2} aria-label={label} role="timer">
      <Box
        flex="1"
        h="3"
        bg="paper"
        border="2px solid"
        borderColor="ink"
        borderRadius="full"
        overflow="hidden"
      >
        <Box h="full" w={`${pct}%`} bg={pct < 25 ? "coral" : tone} transition="width 0.2s linear" />
      </Box>
      <Text color="cream" fontWeight="700" minW="8" textAlign="right">
        {secs}
      </Text>
    </HStack>
  );
}
