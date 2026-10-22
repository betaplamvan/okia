"use client";

import {
  Avatar,
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Image,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuCoffee, LuCopy, LuLink } from "react-icons/lu";
import { BronzeDrum } from "@/components/donate/bronze-drum";
import { toaster } from "@/components/ui/toaster";
import { api, type DonateOut } from "@/lib/api";
import { vietqrPayload } from "@/lib/vietqr";
import { useAuth } from "@/stores/auth";

const TIERS = [20000, 50000, 100000] as const;
const MIN_CUSTOM = 10000;

// Trang /donate (docs/10 — Donate, bố cục theo noitu.fun): lời cảm ơn → ba mốc gợi ý + nhập số
// khác → (chưa liên kết Google: hộp bắt buộc liên kết, không hiện QR) → QR VietQR sinh tại chỗ với
// nội dung "OKIA <mã tài khoản>" → quà Trống Đồng Tri Ân → cách ủng hộ → bảng mạnh thường quân
// (avatar + tên tài khoản trên Ô Kìa). Ủng hộ xong: bỏ quảng cáo vĩnh viễn + Trống Đồng trong hồ sơ.
export function DonateScreen() {
  const t = useTranslations("Donate");
  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  const openProfile = useAuth((s) => s.openProfile);
  const [info, setInfo] = useState<DonateOut | null>(null);
  const [tier, setTier] = useState<number>(50000);
  const [custom, setCustom] = useState("");
  // QR theo payload: chỉ setState khi mã đã sinh xong (bất đồng bộ), payload đổi thì ảnh cũ bị bỏ.
  const [qrState, setQrState] = useState<{ payload: string; url: string } | null>(null);

  useEffect(() => {
    api<DonateOut>("/donate", { token: accessToken })
      .then(setInfo)
      .catch(() => setInfo({ bank: null, myCode: null, supporters: [], count: 0 }));
  }, [accessToken]);

  const linked = !!user && !user.isGuest;
  const customValue = Number(custom.replace(/\D/g, "")) || 0;
  const amount = custom ? customValue : tier;
  const customTooSmall = !!custom && customValue < MIN_CUSTOM;
  const note = info?.myCode ? `OKIA ${info.myCode}` : "";

  const payload =
    info?.bank && note && amount && !customTooSmall
      ? vietqrPayload({ bin: info.bank.bin, accountNo: info.bank.accountNo, amount, note })
      : null;
  useEffect(() => {
    if (!payload) return;
    let alive = true;
    void import("qrcode").then(({ toDataURL }) =>
      toDataURL(payload, { margin: 1, width: 360, errorCorrectionLevel: "M" }).then((url) => {
        if (alive) setQrState({ payload, url });
      }),
    );
    return () => {
      alive = false;
    };
  }, [payload]);
  const qr = payload && qrState?.payload === payload ? qrState.url : null;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toaster.success({ title: t("copied", { what: label }) });
    } catch {
      toaster.error({ title: t("copyFailed") });
    }
  }
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

  return (
    <Container maxW="3xl" px={4} py={{ base: 4, md: 6 }} flex="1">
      <Stack layerStyle="sticker" p={{ base: 4, md: 6 }} gap={5} color="ink">
        {/* Tiêu đề + lời cảm ơn */}
        <Stack gap={2} align="center" textAlign="center">
          <HStack gap={2}>
            <Box fontSize="3xl" lineHeight="1">
              <LuCoffee />
            </Box>
            <Heading size={{ base: "2xl", md: "3xl" }}>{t("title")}</Heading>
          </HStack>
          <Text>{t("intro")}</Text>
        </Stack>

        {/* Mốc ủng hộ */}
        <Stack gap={2}>
          <SectionTitle>{t("tiersTitle")}</SectionTitle>
          <SimpleGrid columns={{ base: 1, sm: 3 }} gap={3}>
            {TIERS.map((a) => {
              const active = !custom && tier === a;
              return (
                <Box key={a} asChild>
                  <button
                    type="button"
                    data-testid={`tier-${a}`}
                    onClick={() => {
                      setTier(a);
                      setCustom("");
                    }}
                    style={{ cursor: "pointer", textAlign: "center" }}
                  >
                    <Stack
                      gap={1}
                      align="center"
                      bg={active ? "sun" : "paper"}
                      border="2px solid"
                      borderColor="ink"
                      borderRadius="xl"
                      boxShadow={active ? "stickerSm" : "sticker"}
                      px={3}
                      py={4}
                      transition="transform 0.15s, box-shadow 0.15s"
                      _hover={{ transform: "translateY(-2px)" }}
                    >
                      <Text fontSize="2xl" fontWeight="700" lineHeight="1">
                        {fmt(a)}đ
                      </Text>
                      <Text fontSize="sm" fontWeight="600">
                        {t(`tier.${a}` as "tier.20000")}
                      </Text>
                      <HStack gap={1} fontSize="xs" opacity={0.85} justify="center" flexWrap="wrap">
                        <BronzeDrum size={16} />
                        <Text as="span">{t("tierGift")}</Text>
                      </HStack>
                    </Stack>
                  </button>
                </Box>
              );
            })}
          </SimpleGrid>
          <Stack gap={1}>
            <HStack gap={2} flexWrap="wrap">
              <Text fontSize="sm" fontWeight="600">
                {t("customLabel")}
              </Text>
              <Input
                size="sm"
                w="40"
                placeholder={t("customPlaceholder")}
                inputMode="numeric"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                bg="paper"
                border="sticker"
                data-testid="donate-custom"
              />
              <Text fontSize="sm" opacity={0.8}>
                {custom && !customTooSmall ? `= ${fmt(customValue)}đ` : ""}
              </Text>
            </HStack>
            <Text fontSize="xs" opacity={0.8} color={customTooSmall ? "coral" : undefined}>
              {customTooSmall
                ? t("customTooSmall", { min: fmt(MIN_CUSTOM) })
                : t("customHint", { min: fmt(MIN_CUSTOM) })}
            </Text>
          </Stack>
        </Stack>

        {/* Bắt buộc liên kết Google → mới có QR */}
        {!linked ? (
          <Stack
            gap={3}
            border="2px dashed"
            borderColor="ink"
            borderRadius="xl"
            p={4}
            align="center"
            textAlign="center"
            data-testid="donate-link-required"
          >
            <Text fontWeight="700" fontSize="lg">
              {t("linkTitle")}
            </Text>
            <Text fontSize="sm">{t("linkBody")}</Text>
            <Button
              variant="sticker"
              bg="mint"
              onClick={() => openProfile("account")}
              data-sfx="open"
            >
              <LuLink /> {t("linkButton")}
            </Button>
          </Stack>
        ) : info?.bank ? (
          <Stack gap={3} data-testid="donate-bank">
            <SectionTitle>{t("qrTitle")}</SectionTitle>
            <HStack align="flex-start" gap={4} flexWrap="wrap">
              <Box
                w="220px"
                h="220px"
                bg="paper"
                border="sticker"
                borderRadius="lg"
                overflow="hidden"
                flexShrink={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {qr ? (
                  <Image src={qr} alt="VietQR" w="full" h="full" data-testid="donate-qr" />
                ) : (
                  <Text fontSize="xs" opacity={0.6} px={3} textAlign="center">
                    {t("qrWaiting")}
                  </Text>
                )}
              </Box>
              <Stack gap={2} fontSize="sm" minW={0} flex="1">
                <Row label={t("bank")} value={info.bank.name} />
                <Row
                  label={t("accountNo")}
                  value={info.bank.accountNo}
                  onCopy={() => void copy(info.bank!.accountNo, t("accountNo"))}
                />
                <Row label={t("accountName")} value={info.bank.accountName} />
                <Row
                  label={t("note")}
                  value={note}
                  onCopy={() => void copy(note, t("note"))}
                  testId="donate-note"
                />
                <Row
                  label={t("amount")}
                  value={amount && !customTooSmall ? `${fmt(amount)}đ` : "—"}
                />
                <Text fontSize="xs" opacity={0.75}>
                  {t("noteHint")}
                </Text>
              </Stack>
            </HStack>
          </Stack>
        ) : (
          <Text>{info ? t("noBank") : "…"}</Text>
        )}

        {/* Quà Trống Đồng */}
        <HStack
          gap={3}
          bg="cream"
          border="sticker"
          borderRadius="xl"
          p={3}
          align="center"
          data-testid="donate-gift"
        >
          <Box flexShrink={0}>
            <BronzeDrum size={64} />
          </Box>
          <Text fontSize="sm">
            {t.rich("gift", {
              b: (chunks) => (
                <Text as="span" fontWeight="700">
                  {chunks}
                </Text>
              ),
            })}
          </Text>
        </HStack>

        {/* Cách ủng hộ */}
        <Stack gap={1}>
          <SectionTitle>{t("howTitle")}</SectionTitle>
          {(["how1", "how2", "how3"] as const).map((k, i) => (
            <Text key={k} fontSize="sm">
              {i + 1}. {t(k)}
            </Text>
          ))}
        </Stack>

        {/* Mạnh thường quân */}
        <Stack gap={2} data-testid="donate-thanks">
          <SectionTitle>{t("thanksTitle")}</SectionTitle>
          {!info ? null : info.supporters.length === 0 ? (
            <Text fontSize="sm" opacity={0.8}>
              {t("thanksEmpty")}
            </Text>
          ) : (
            info.supporters.map((s, i) => (
              <HStack
                key={s.userId}
                gap={3}
                bg={s.mine ? "mint" : "paper"}
                border="sticker"
                borderRadius="full"
                px={3}
                py={1.5}
                data-testid={`supporter-${s.userId}`}
              >
                <Box
                  w="26px"
                  h="26px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor="ink"
                  bg="sun"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="xs"
                  fontWeight="700"
                  flexShrink={0}
                >
                  {i + 1}
                </Box>
                <Avatar.Root size="sm" border="2px solid" borderColor="ink" bg="sun" color="ink">
                  <Avatar.Fallback name={s.name} fontWeight="700" />
                  {s.avatarUrl ? <Avatar.Image src={s.avatarUrl} /> : null}
                </Avatar.Root>
                <Text fontWeight="700" truncate>
                  {s.name}
                  {s.mine ? ` · ${t("you")}` : ""}
                </Text>
                <Box ms="auto" flexShrink={0}>
                  <BronzeDrum size={22} />
                </Box>
              </HStack>
            ))
          )}
        </Stack>

        <Text fontSize="sm" textAlign="center" opacity={0.85}>
          {t("outro")}
        </Text>
        <Text fontSize="xs" opacity={0.7} textAlign="center">
          {t("legal")}
        </Text>
      </Stack>
    </Container>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Heading size="md" borderLeft="4px solid" borderColor="mint" ps={2} lineHeight="1.2">
      {children}
    </Heading>
  );
}

function Row({
  label,
  value,
  onCopy,
  testId,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  testId?: string;
}) {
  return (
    <HStack justify="space-between" gap={2}>
      <Text opacity={0.7} flexShrink={0}>
        {label}
      </Text>
      <HStack gap={1} minW={0}>
        <Text fontWeight="700" truncate data-testid={testId}>
          {value}
        </Text>
        {onCopy ? (
          <Button size="xs" variant="sticker" onClick={onCopy} aria-label={label}>
            <LuCopy />
          </Button>
        ) : null}
      </HStack>
    </HStack>
  );
}
