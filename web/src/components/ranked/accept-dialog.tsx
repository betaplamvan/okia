"use client";

import { Box, Button, Dialog, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LuSwords } from "react-icons/lu";
import { audio } from "@/game/audio/audio-manager";
import { serverNow } from "@/net/ws-client";

type Props = {
  open: boolean;
  expiresAt: number;
  acceptSeconds: number;
  accepted: boolean;
  /** Số người khác đã chấp nhận (0 hoặc 1). */
  others: number;
  /** Đối thủ là máy (chờ lâu, docs/07): máy đã nhận sẵn, vẫn có thể từ chối. */
  bot?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

// Vòng đếm ngược kiểu "ready check": gần hết hộp, số giây to ở giữa (viewBox 340, bán kính 150).
const SIZE = 340;
const R = 150;
const CIRC = 2 * Math.PI * R;
const RING = "min(82vw, 340px)";

// Hộp chấp nhận trận (docs/07 — Chấp nhận trận): tiêu đề trên, vòng đếm ngược lớn theo giờ server
// với số giây to ở giữa, trạng thái dưới vòng, "Chơi luôn!" to, "Từ chối" nhỏ; 5 giây cuối gõ nhịp.
// Không đóng bằng ESC/click ngoài: chỉ hai nút (hết giờ server tự hủy).
export function AcceptDialog({
  open,
  expiresAt,
  acceptSeconds,
  accepted,
  others,
  bot = false,
  onAccept,
  onDecline,
}: Props) {
  const t = useTranslations("Ranked");
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(id);
  }, [open]);
  const remainingMs = Math.max(0, expiresAt - now);
  const frac = Math.min(1, remainingMs / (acceptSeconds * 1000));
  const secs = Math.ceil(remainingMs / 1000);
  const tone = accepted ? "mint" : frac < 0.3 ? "coral" : "sun";
  const color = tone === "mint" ? "#7cf5c5" : tone === "coral" ? "#ff6b6b" : "#ffd93d";

  // Nhịp gõ 5 giây cuối (chưa bấm nhận): mỗi giây một tiếng, cao dần.
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!open || accepted || secs > 5 || secs <= 0 || lastTick.current === secs) return;
    lastTick.current = secs;
    audio.play("count", { rate: 1.6 - secs * 0.08, volume: 0.6 });
  }, [open, accepted, secs]);

  const status = accepted
    ? t("waitingOther")
    : bot
      ? t("botReadyShort")
      : others > 0
        ? t("otherAcceptedShort")
        : t("acceptWithinShort");

  return (
    <Dialog.Root
      placement="center"
      open={open}
      lazyMount
      unmountOnExit
      closeOnEscape={false}
      closeOnInteractOutside={false}
    >
      <Portal>
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.75)" />
        <Dialog.Positioner px={3}>
          <Dialog.Content
            layerStyle="sticker"
            p={0}
            overflow="hidden"
            maxW="md"
            w="full"
            textAlign="center"
            data-testid="accept-dialog"
          >
            <Dialog.Title srOnly>{t("foundTitle")}</Dialog.Title>
            <Dialog.Body color="ink" py={5} px={4}>
              <Stack gap={3} align="center">
                <HStack gap={2} justify="center">
                  <Box fontSize="2xl" lineHeight="1">
                    <LuSwords />
                  </Box>
                  <Text
                    fontSize={{ base: "2xl", md: "3xl" }}
                    fontWeight="700"
                    lineHeight="1.1"
                    textTransform="uppercase"
                  >
                    {t("foundTitle")}
                  </Text>
                </HStack>

                {/* Vòng đếm ngược: viền paper + vòng màu rút dần theo thời gian còn lại; số giây to ở giữa. */}
                <Box position="relative" w={RING} h={RING}>
                  <svg
                    viewBox={`0 0 ${SIZE} ${SIZE}`}
                    width="100%"
                    height="100%"
                    aria-hidden="true"
                  >
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="#fffcf2"
                      stroke="#1a2826"
                      strokeWidth="3"
                    />
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="none"
                      stroke="rgba(26,40,38,0.12)"
                      strokeWidth="18"
                    />
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="none"
                      stroke={color}
                      strokeWidth="18"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={CIRC * (1 - frac)}
                      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                      style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
                    />
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R - 13}
                      fill="none"
                      stroke="#1a2826"
                      strokeWidth="2"
                      opacity="0.5"
                    />
                  </svg>
                  <Stack
                    position="absolute"
                    inset="0"
                    align="center"
                    justify="center"
                    gap={0}
                    px={10}
                  >
                    <Text
                      fontSize={{ base: "7xl", md: "8xl" }}
                      fontWeight="700"
                      lineHeight="1"
                      fontVariantNumeric="tabular-nums"
                      color={tone === "coral" && !accepted ? "coral" : "ink"}
                      data-testid="accept-seconds"
                    >
                      {secs}
                    </Text>
                    <Text
                      fontSize="sm"
                      opacity={0.7}
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      {t("secondsLabel")}
                    </Text>
                  </Stack>
                </Box>

                <Text fontSize="md" fontWeight="600" role="status">
                  {status}
                </Text>
                {bot ? (
                  <Text fontSize="sm" opacity={0.85} data-testid="accept-bot">
                    {t("vsBot")}
                  </Text>
                ) : null}

                <Button
                  variant="sticker"
                  bg="mint"
                  size="lg"
                  w="full"
                  maxW="300px"
                  disabled={accepted}
                  onClick={onAccept}
                  data-sfx="confirm"
                  data-testid="accept-match"
                >
                  {accepted ? t("accepted") : t("acceptNow")}
                </Button>
                <Button
                  variant="sticker"
                  size="sm"
                  onClick={onDecline}
                  data-sfx="back"
                  data-testid="decline-match"
                >
                  {t("decline")}
                </Button>
              </Stack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
