"use client";

import {
  Box,
  Button,
  CloseButton,
  Container,
  Dialog,
  Flex,
  HStack,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LuBot, LuFlag, LuRotateCcw, LuUser } from "react-icons/lu";
import { BoardCanvas } from "@/components/play/board-canvas";
import {
  adaptAfterResult,
  getServerSettings,
  getSettings,
  SIZES,
  subscribeSettings,
  updateSettings,
  type Size,
} from "@/components/play/play-settings";
import { useGameSounds } from "@/components/play/use-game-sounds";
import { audio } from "@/game/audio/audio-manager";
import { LocalBotController, type GameResult } from "@/game/controller";
import type { RendererEvent } from "@/game/renderer/board-renderer";
import { Link } from "@/i18n/navigation";

export function PlayScreen() {
  const t = useTranslations("Play");
  const locale = useLocale();
  const [resignOpen, setResignOpen] = useState(false);
  // Kết quả chỉ hiện sau khi renderer đếm xong ô (P0-14); có dự phòng nếu renderer không báo.
  const [settled, setSettled] = useState<GameResult | null>(null);
  const [controller] = useState(() => new LocalBotController({ rows: 5, cols: 5 }));
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getServerSettings);

  // Đồng bộ controller với cài đặt đã lưu và theo dõi kết quả ván để chỉnh độ mạnh.
  // pause/resume để StrictMode (effect chạy hai lần ở dev) không làm mất bot.
  useEffect(() => {
    const s = getSettings();
    controller.setStrength(s.strength);
    if (s.size !== controller.getSession().state.rows) {
      controller.newGame({ rows: s.size, cols: s.size });
    }
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
  const onRendererEvent = useCallback((e: RendererEvent) => {
    if (e.type === "count") audio.playCount(e.n);
    else setSettled(e.result);
  }, []);
  useGameSounds(session);

  const changeSize = (size: Size) => {
    audio.playUi("click");
    updateSettings({ size });
    controller.newGame({ rows: size, cols: size });
  };

  const newGame = () => {
    audio.playUi("confirm");
    controller.newGame();
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
  const youScore = numberFormat.format(state.scores[human]);
  const botScore = numberFormat.format(state.scores[bot]);
  const yourTurn = state.turn === human && !result;
  const twoTapTouch = settings.size === 7;

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
      <Flex direction={{ base: "column", md: "row" }} gap={{ base: 3, md: 6 }} align="flex-start">
        {/* HUD: trên điện thoại nằm ngang phía trên bàn; md+ thành cột bên trái (bề rộng cố định). */}
        <Stack
          direction={{ base: "row", md: "column" }}
          justify={{ base: "space-between", md: "flex-start" }}
          align={{ base: "center", md: "stretch" }}
          w={{ base: "full", md: "56" }}
          flexShrink={0}
          gap={3}
        >
          <PlayerChip
            icon={<LuUser />}
            name={t("you")}
            score={youScore}
            tone={human === 0 ? "pen.blue" : "pen.red"}
            active={yourTurn}
          />
          <Box textAlign="center" flex="1" color="cream" fontWeight="600" minH="6" role="status">
            {result ? resultTitle : thinking ? t("botThinking") : yourTurn ? t("yourTurn") : ""}
            {combo >= 2 && !result ? (
              <Text as="span" display="block" color="sun" fontSize="xl" fontWeight="700">
                {t("combo", { n: numberFormat.format(combo) })}
              </Text>
            ) : null}
          </Box>
          <PlayerChip
            icon={<LuBot />}
            name={t("bot")}
            score={botScore}
            tone={bot === 0 ? "pen.blue" : "pen.red"}
            active={!yourTurn && !result}
            reverse
          />
        </Stack>

        <Box flex="1" minW={0} w="full">
          <BoardCanvas
            session={session}
            onSelectEdge={onSelectEdge}
            onEvent={onRendererEvent}
            twoTapTouch={twoTapTouch}
            label={t("board")}
            comboLabel={comboLabel}
          />
          {twoTapTouch ? (
            <Text textAlign="center" fontSize="sm" color="cream" opacity={0.8} mt={1}>
              {t("twoTapHint")}
            </Text>
          ) : null}
        </Box>

        <Stack w={{ base: "full", md: "48" }} flexShrink={0} gap={3}>
          <HStack justify="center" gap={2} role="group" aria-label={t("boardSize")}>
            {SIZES.map((n) => (
              <Button
                key={n}
                variant="sticker"
                size="sm"
                bg={settings.size === n ? "mint" : "paper"}
                aria-pressed={settings.size === n}
                onClick={() => changeSize(n)}
              >
                {t("size", { n: String(n) })}
              </Button>
            ))}
          </HStack>
          <HStack justify="center" gap={2}>
            <Button variant="sticker" size="sm" onClick={newGame}>
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
      </Flex>

      {/* Xác nhận đầu hàng */}
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
                <Button variant="sticker" bg="mint" onClick={newGame}>
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

type PlayerChipProps = {
  icon: React.ReactNode;
  name: string;
  score: string;
  tone: string;
  active: boolean;
  reverse?: boolean;
};

function PlayerChip({ icon, name, score, tone, active, reverse }: PlayerChipProps) {
  return (
    <HStack
      flexDirection={reverse ? "row-reverse" : "row"}
      gap={2}
      bg="paper"
      color="ink"
      border="sticker"
      borderRadius="full"
      boxShadow={active ? "sticker" : "stickerSm"}
      px={2}
      py={1}
      opacity={active ? 1 : 0.75}
      transform={active ? "translate(0,0)" : "translate(2px,2px)"}
      transition="all 0.15s"
    >
      <Flex
        align="center"
        justify="center"
        boxSize="8"
        borderRadius="full"
        bg={tone}
        color="paper"
        border="2px solid"
        borderColor="ink"
      >
        {icon}
      </Flex>
      <Text fontWeight="600">{name}</Text>
      <Text fontWeight="700" fontSize="xl" px={2} minW="8" textAlign="center">
        {score}
      </Text>
    </HStack>
  );
}
