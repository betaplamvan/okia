"use client";

import {
  Box,
  Button,
  CloseButton,
  Container,
  Dialog,
  HStack,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LuBot, LuFlag, LuMap, LuRotateCcw, LuUser } from "react-icons/lu";
import { afterFinishedGame, useInterstitialOpen } from "@/components/ads/adsense";
import { BoardCanvas } from "@/components/play/board-canvas";
import { GameLayout } from "@/components/play/game-layout";
import { MapPicker, ShowLastMoveToggle, useMapName } from "@/components/play/map-picker";
import { InteractionBar } from "@/components/play/interaction-bar";
import { FirstTurnBanner } from "@/components/play/first-turn-banner";
import { InteractionLayer } from "@/components/play/interaction-layer";
import { useCatalog } from "@/stores/catalog";
import { PlayerChip } from "@/components/play/player-chip";
import {
  adaptAfterResult,
  getServerSettings,
  getSettings,
  subscribeSettings,
  updateSettings,
} from "@/components/play/play-settings";
import { useGameSounds } from "@/components/play/use-game-sounds";
import { audio } from "@/game/audio/audio-manager";
import { LocalBotController, type GameResult } from "@/game/controller";
import { DEFAULT_MAP_ID } from "@/game/maps";
import { allThrows, seatSkins } from "@/game/skins/skins";
import type { RendererEvent } from "@/game/renderer/board-renderer";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/stores/auth";

export function PlayScreen() {
  const t = useTranslations("Play");
  const tm = useTranslations("Maps");
  const mapName = useMapName();
  const locale = useLocale();
  const [resignOpen, setResignOpen] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [pickedMap, setPickedMap] = useState(DEFAULT_MAP_ID);
  // Kết quả chỉ hiện sau khi renderer đếm xong ô (P0-14); có dự phòng nếu renderer không báo.
  const [settled, setSettled] = useState<GameResult | null>(null);
  const adOpen = useInterstitialOpen();
  const [controller] = useState(() => new LocalBotController({ mapId: DEFAULT_MAP_ID }));
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getServerSettings);

  // Đồng bộ controller với cài đặt đã lưu và theo dõi kết quả ván để chỉnh độ mạnh.
  // pause/resume để StrictMode (effect chạy hai lần ở dev) không làm mất bot.
  useEffect(() => {
    const s = getSettings();
    controller.setStrength(s.strength);
    controller.setShowLastMove(s.showLastMove);
    if (s.mapId !== controller.mapChoice) controller.newGame({ mapId: s.mapId });
    let handled: GameResult | null = controller.getSession().result;
    const unsubscribe = controller.subscribe(() => {
      const { result, human } = controller.getSession();
      if (!result || result === handled) return;
      handled = result;
      const humanWon = result.winner === null ? null : result.winner === human;
      const next = updateSettings(adaptAfterResult(getSettings(), humanWon));
      controller.setStrength(next.strength);
    });
    controller.resume();
    return () => {
      unsubscribe();
      controller.pause();
    };
  }, [controller]);

  const subscribe = useCallback((l: () => void) => controller.subscribe(l), [controller]);
  const getSession = useCallback(() => controller.getSession(), [controller]);
  const session = useSyncExternalStore(subscribe, getSession, getSession);

  const onSelectEdge = useCallback((edge: number) => controller.play(edge), [controller]);

  // Tương tác trong trận (docs/08 — Đồ ném): đồ ném mình có = default + đã mua (tài khoản thật).
  const ownedIds = useAuth((s) => s.skins?.owned);
  const loadSkins = useAuth((s) => s.loadSkins);
  const me = useAuth((s) => s.user);
  const catalogLive = useCatalog((s) => s.skins);
  useEffect(() => {
    if (me && !me.isGuest && !ownedIds) void loadSkins().catch(() => undefined);
  }, [me, ownedIds, loadSkins]);
  const throwItems = useMemo(
    () => allThrows().filter((t) => t.default || ownedIds?.includes(t.id)),
    // catalogLive: catalog từ API tới sau → tính lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownedIds, catalogLive],
  );
  const onRendererEvent = useCallback((e: RendererEvent) => {
    if (e.type === "count") audio.playCount(e.n);
    else setSettled(e.result);
  }, []);
  // Skin của mình theo ghế đang ngồi; máy dùng skin mặc định (ADR-0013).
  const loadout = useAuth((s) => s.user?.loadout);
  const skins = useMemo(() => {
    const mine = session.human;
    return seatSkins(mine === 0 ? loadout : null, mine === 1 ? loadout : null);
  }, [loadout, session.human]);
  useGameSounds(session, skins);

  const openMaps = () => {
    setPickedMap(getSettings().mapId);
    setMapsOpen(true);
  };

  const applyMap = () => {
    updateSettings({ mapId: pickedMap });
    controller.newGame({ mapId: pickedMap });
    setSettled(null);
    setMapsOpen(false);
  };

  const toggleShowLastMove = (on: boolean) => {
    updateSettings({ showLastMove: on });
    controller.setShowLastMove(on);
  };

  // Ván đã kết thúc → có thể chen quảng cáo xen (cứ 3 ván một lần, docs/10) rồi mới mở ván mới.
  const newGame = () => {
    if (controller.getSession().result) {
      // Hộp kết quả (Dialog modal) tự đóng khi quảng cáo xen hiện (adOpen), không mở lại.
      afterFinishedGame(() => controller.newGame());
    } else controller.newGame();
  };

  const { state, human, bot, thinking, result, combo } = session;
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const comboLabel = useCallback(
    (n: number) => t("combo", { n: numberFormat.format(n) }),
    [t, numberFormat],
  );

  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setSettled(result), 4000);
    return () => clearTimeout(id);
  }, [result]);

  // Nhiệm vụ (ADR-0010): ghi combo lớn nhất của mình trong ván, báo server khi ván kết thúc.
  const reportBotGame = useAuth((s) => s.reportBotGame);
  const maxComboRef = useRef(0);
  useEffect(() => {
    if (state.moveNo === 0) maxComboRef.current = 0;
    if (state.turn === human && combo > maxComboRef.current) maxComboRef.current = combo;
  }, [state.moveNo, state.turn, human, combo]);
  useEffect(() => {
    if (!result || result.reason !== "complete") return;
    void reportBotGame({
      won: result.winner === human,
      maxCombo: maxComboRef.current,
      moves: state.moveNo,
    });
  }, [result, human, state.moveNo, reportBotGame]);
  const youScore = numberFormat.format(state.scores[human]);
  const botScore = numberFormat.format(state.scores[bot]);
  const yourTurn = state.turn === human && !result;
  const twoTapTouch = Math.max(state.rows, state.cols) >= 7;

  const resultTitle = result
    ? result.winner === null
      ? t("resultDraw")
      : result.winner === human
        ? t("resultWin")
        : t("resultLose")
    : "";
  const resultTone = result?.winner === human ? "mint" : result?.winner === null ? "sun" : "coral";

  return (
    <Container maxW="6xl" px={{ base: 2, md: 4 }} py={{ base: 2, md: 4 }} flex="1">
      <InteractionLayer source={controller} />
      <FirstTurnBanner session={session} opponentName={t("bot")} />
      <GameLayout
        me={
          <PlayerChip
            hudSeat={human}
            icon={<LuUser />}
            name={t("you")}
            score={youScore}
            tone="pen.blue"
            active={yourTurn}
          />
        }
        opponent={
          <PlayerChip
            hudSeat={bot}
            icon={<LuBot />}
            name={t("bot")}
            score={botScore}
            tone="pen.red"
            active={!yourTurn && !result}
            reverse
          />
        }
        status={
          <Box textAlign="center" color="cream" fontWeight="600" minH="6" role="status">
            {result ? resultTitle : thinking ? t("botThinking") : yourTurn ? t("yourTurn") : ""}
            {combo >= 2 && !result ? (
              <Text as="span" display="block" color="sun" fontSize="xl" fontWeight="700">
                {t("combo", { n: numberFormat.format(combo) })}
              </Text>
            ) : null}
          </Box>
        }
        board={
          <>
            <BoardCanvas
              session={session}
              onSelectEdge={onSelectEdge}
              onEvent={onRendererEvent}
              twoTapTouch={twoTapTouch}
              label={t("board")}
              comboLabel={comboLabel}
              skins={skins}
            />
            {twoTapTouch ? (
              <Text textAlign="center" fontSize="sm" color="cream" opacity={0.8} mt={1}>
                {t("twoTapHint")}
              </Text>
            ) : null}
          </>
        }
        controls={
          <Stack gap={3}>
            <InteractionBar
              items={throwItems}
              disabled={!!result}
              onEmote={(id) => controller.emote(id)}
              onThrow={(id) => controller.throwItem(id)}
            />
            <HStack justify="center" gap={2} flexWrap="wrap">
              <Text color="cream" fontWeight="700" data-testid="map-name">
                {tm("current", { name: mapName(session.mapId) })}
                {settings.mapId === "random" ? ` (${tm("random")})` : ""}
              </Text>
              <Button variant="sticker" size="sm" bg="sun" onClick={openMaps}>
                <LuMap /> {tm("change")}
              </Button>
            </HStack>
            <HStack justify="center" gap={2}>
              <Button variant="sticker" size="sm" onClick={newGame} data-sfx="confirm">
                <LuRotateCcw /> {t("newGame")}
              </Button>
              <Button
                variant="sticker"
                size="sm"
                bg="coral"
                disabled={!!result || state.moveNo === 0}
                onClick={() => setResignOpen(true)}
              >
                <LuFlag /> {t("resign")}
              </Button>
            </HStack>
          </Stack>
        }
      />

      {/* Xác nhận đầu hàng */}
      <Dialog.Root
        placement="center"
        open={mapsOpen}
        onOpenChange={(e) => setMapsOpen(e.open)}
        scrollBehavior="inside"
      >
        <Portal>
          <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
          <Dialog.Positioner px={4}>
            <Dialog.Content layerStyle="sticker" p={0} overflow="hidden" maxW="lg">
              <Dialog.Header bg="sun" borderBottom="sticker">
                <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                  {tm("optionsTitle")}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" py={5}>
                <Stack gap={4}>
                  <MapPicker value={pickedMap} onChange={setPickedMap} label={tm("board")} />
                  {pickedMap === "random" ? (
                    <Text fontSize="sm" opacity={0.8}>
                      {tm("randomHint")}
                    </Text>
                  ) : null}
                  <ShowLastMoveToggle
                    checked={settings.showLastMove}
                    onChange={toggleShowLastMove}
                  />
                </Stack>
              </Dialog.Body>
              <Dialog.Footer pb={5} gap={3}>
                <Button variant="sticker" onClick={() => setMapsOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button variant="sticker" bg="mint" onClick={applyMap} data-sfx="confirm">
                  {tm("apply")}
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
                  {t("resignTitle")}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" fontSize="lg" py={5}>
                {t("resignBody")}
              </Dialog.Body>
              <Dialog.Footer pb={5} gap={3}>
                <Button variant="sticker" onClick={() => setResignOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="sticker"
                  bg="coral"
                  onClick={() => {
                    controller.resign();
                    setResignOpen(false);
                  }}
                >
                  {t("confirmResign")}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" color="ink" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Kết thúc ván */}
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={!!result && settled === result && !adOpen}
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
                  {youScore} – {botScore}
                </Text>
                <Text mt={2} opacity={0.8}>
                  {t("finalScore", { you: t("you"), bot: t("bot") })}
                </Text>
              </Dialog.Body>
              <Dialog.Footer pb={5} gap={3} justifyContent="center">
                <Button asChild variant="sticker">
                  <Link href="/">{t("backHome")}</Link>
                </Button>
                <Button variant="sticker" bg="mint" onClick={newGame} data-sfx="confirm">
                  {t("playAgain")}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Container>
  );
}
