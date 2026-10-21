"use client";

import { Button, Container, Field, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuLogIn, LuPlus } from "react-icons/lu";
import { TextInput } from "@/components/auth/account-tab";
import { MapPicker, ShowLastMoveToggle } from "@/components/play/map-picker";
import { toaster } from "@/components/ui/toaster";
import { audio } from "@/game/audio/audio-manager";
import { DEFAULT_MAP_ID } from "@/game/maps";
import type { ServerMsg } from "@/game/ws-types";
import { useRouter } from "@/i18n/navigation";
import { useConnection, wsClient } from "@/net/ws-client";

type Turn = 15 | 30 | 60 | null;
const TURNS: Turn[] = [15, 30, 60, null];

// Sảnh phòng riêng (P1-19): tạo phòng (cỡ bàn, giờ mỗi lượt) hoặc vào bằng mã. Khách chơi được.
export function RoomLobby() {
  const t = useTranslations("Room");
  const tm = useTranslations("Maps");
  const router = useRouter();
  const status = useConnection((s) => s.status);
  // Id map hoặc "random" — server chốt map cụ thể khi tạo phòng.
  const [board, setBoard] = useState(DEFAULT_MAP_ID);
  const [showLastMove, setShowLastMove] = useState(true);
  const [turn, setTurn] = useState<Turn>(30);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void wsClient.connect();
    // cacheComponents: rời trang thì sảnh chỉ bị ẩn (<Activity>), state giữ nguyên → không reset ở đây
    // thì quay lại sau ván, nút "Tạo phòng" vẫn quay (create() thành công không tự tắt loading).
    return () => setCreating(false);
  }, []);

  // Đang dở phòng (welcome.activeRoomId) → vào lại luôn.
  const activeRoomId = useConnection((s) => s.activeRoomId);
  useEffect(() => {
    if (activeRoomId) router.replace(`/r/${activeRoomId}`);
  }, [activeRoomId, router]);

  async function create() {
    audio.playUi("confirm");
    setCreating(true);
    try {
      await wsClient.connect();
      const roomId = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          off();
          reject(new Error("timeout"));
        }, 8000);
        const off = wsClient.subscribe((m: ServerMsg) => {
          if (m.t === "room_state") {
            clearTimeout(timer);
            off();
            resolve(m.roomId);
          } else if (m.t === "error" && m.ref === "room_create") {
            clearTimeout(timer);
            off();
            reject(new Error(m.message));
          }
        });
        wsClient.send({ t: "room_create", board, turnSeconds: turn, showLastMove });
      });
      router.push(`/r/${roomId}`);
    } catch (e) {
      toaster.error({
        title: e instanceof Error && e.message !== "timeout" ? e.message : t("noConnection"),
      });
      setCreating(false);
    }
  }

  function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "")
      .trim()
      .toUpperCase();
    if (code.length < 4) return;
    audio.playUi("confirm");
    router.push(`/r/${code}`);
  }

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

        {/* Desktop: tạo phòng bên trái (rộng), vào bằng mã bên phải — không phải cuộn dọc. */}
        <Grid
          templateColumns={{ base: "1fr", md: "3fr 2fr" }}
          gap={{ base: 4, md: 5 }}
          alignItems="start"
        >
          <Stack layerStyle="sticker" p={5} gap={4}>
            <Heading size="xl" color="ink">
              {t("create")}
            </Heading>
            <Stack gap={1}>
              <Text fontWeight="700">{tm("board")}</Text>
              <MapPicker value={board} onChange={setBoard} label={tm("board")} />
            </Stack>
            <Stack gap={1}>
              <Text fontWeight="700">{t("turnTime")}</Text>
              <HStack gap={2} flexWrap="wrap" role="group" aria-label={t("turnTime")}>
                {TURNS.map((n) => (
                  <Button
                    key={String(n)}
                    variant="sticker"
                    size="sm"
                    bg={turn === n ? "mint" : "paper"}
                    aria-pressed={turn === n}
                    onClick={() => setTurn(n)}
                  >
                    {n === null ? t("noLimit") : t("seconds", { n: String(n) })}
                  </Button>
                ))}
              </HStack>
            </Stack>
            <ShowLastMoveToggle checked={showLastMove} onChange={setShowLastMove} />
            <Button
              variant="sticker"
              bg="mint"
              size="lg"
              loading={creating}
              loadingText={t("creating")}
              disabled={status === "offline"}
              onClick={create}
            >
              <LuPlus /> {t("create")}
            </Button>
          </Stack>

          <Stack gap={4}>
            <form onSubmit={join}>
              <Stack layerStyle="sticker" p={5} gap={3}>
                <Heading size="xl" color="ink">
                  {t("join")}
                </Heading>
                <Field.Root required>
                  <Field.Label>{t("codeLabel")}</Field.Label>
                  <TextInput
                    name="code"
                    placeholder={t("codePlaceholder")}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={8}
                    textTransform="uppercase"
                    letterSpacing="2px"
                    fontSize="2xl"
                    textAlign="center"
                  />
                </Field.Root>
                <Button type="submit" variant="sticker" bg="sun">
                  <LuLogIn /> {t("joinButton")}
                </Button>
              </Stack>
            </form>

            {status === "offline" ? (
              <Text textAlign="center" color="sun" role="status">
                {t("reconnecting")}
              </Text>
            ) : null}
          </Stack>
        </Grid>
      </Stack>
    </Container>
  );
}
