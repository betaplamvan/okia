"use client";

import { Box, Button, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuSwords } from "react-icons/lu";
import { serverNow } from "@/net/ws-client";

type Props = {
  open: boolean;
  expiresAt: number;
  acceptSeconds: number;
  accepted: boolean;
  /** Số người khác đã chấp nhận (0 hoặc 1). */
  others: number;
  onAccept: () => void;
  onDecline: () => void;
};

const R = 92;
const CIRC = 2 * Math.PI * R;

// Hộp chấp nhận trận (docs/07 — Chấp nhận trận): vòng đếm ngược theo giờ server, "Chơi luôn!" to,
// "Từ chối" nhỏ; sau khi bấm nhận thì chờ người kia, vòng vẫn chạy. Không đóng bằng ESC/click ngoài:
// chỉ hai nút (hết giờ server tự hủy).
export function AcceptDialog({
  open,
  expiresAt,
  acceptSeconds,
  accepted,
  others,
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
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.7)" />
        <Dialog.Positioner px={4}>
          <Dialog.Content
            layerStyle="sticker"
            p={0}
            overflow="hidden"
            maxW="sm"
            textAlign="center"
            data-testid="accept-dialog"
          >
            <Dialog.Title srOnly>{t("foundTitle")}</Dialog.Title>
            <Dialog.Body color="ink" py={6}>
              <Stack gap={4} align="center">
                {/* Vòng đếm ngược: viền paper + vòng màu rút dần theo thời gian còn lại. */}
                <Box position="relative" w="220px" h="220px">
                  <svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true">
                    <circle
                      cx="110"
                      cy="110"
                      r={R}
                      fill="#fffcf2"
                      stroke="#1a2826"
                      strokeWidth="3"
                    />
                    <circle
                      cx="110"
                      cy="110"
                      r={R}
                      fill="none"
                      stroke={
                        tone === "mint" ? "#7cf5c5" : tone === "coral" ? "#ff6b6b" : "#ffd93d"
                      }
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={CIRC * (1 - frac)}
                      transform="rotate(-90 110 110)"
                      style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
                    />
                    <circle
                      cx="110"
                      cy="110"
                      r={R - 9}
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
                    gap={1}
                    px={6}
                  >
                    <Box fontSize="3xl" color="ink" lineHeight="1">
                      <LuSwords />
                    </Box>
                    <Text
                      fontSize="2xl"
                      fontWeight="700"
                      lineHeight="1.1"
                      textTransform="uppercase"
                    >
                      {t("foundTitle")}
                    </Text>
                    <Text fontSize="sm" opacity={0.8} role="status">
                      {accepted
                        ? t("waitingOther")
                        : others > 0
                          ? t("otherAccepted", { s: String(secs) })
                          : t("acceptWithin", { s: String(secs) })}
                    </Text>
                  </Stack>
                </Box>
                <Button
                  variant="sticker"
                  bg="mint"
                  size="lg"
                  w="full"
                  maxW="260px"
                  disabled={accepted}
                  onClick={onAccept}
                  data-testid="accept-match"
                >
                  {accepted ? t("accepted") : t("acceptNow")}
                </Button>
                <Button variant="sticker" size="sm" onClick={onDecline} data-testid="decline-match">
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
