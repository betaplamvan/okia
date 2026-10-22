"use client";

import {
  Badge,
  Box,
  Button,
  Container,
  Grid,
  Heading,
  HStack,
  Image,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { LuCoffee, LuCopy, LuHeart } from "react-icons/lu";
import { toaster } from "@/components/ui/toaster";
import { api, type DonateOut } from "@/lib/api";
import { transferNote, vietqrPayload } from "@/lib/vietqr";
import { useAuth } from "@/stores/auth";

const AMOUNTS = [20000, 50000, 100000, 200000];

// Trang /donate (docs/10 — Donate, ADR-0005): ủng hộ tự nguyện, không đổi lấy gì trong game.
// VietQR sinh tại chỗ (lib/vietqr) với số tiền + nội dung "OKIA <tên>" (người đã đăng nhập: mã
// tài khoản để bảng cảm ơn tự nhận ra); Ko-fi cho nước ngoài; bảng cảm ơn chỉ tên + tháng.
export function DonateScreen() {
  const t = useTranslations("Donate");
  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  const [info, setInfo] = useState<DonateOut | null>(null);
  const [amount, setAmount] = useState<number | null>(50000);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    api<DonateOut>("/donate", { token: accessToken })
      .then(setInfo)
      .catch(() => setInfo({ bank: null, kofiUrl: null, myCode: null, thanks: [], count: 0 }));
  }, [accessToken]);

  // Nội dung chuyển khoản: mã tài khoản (đã đăng nhập) hoặc tên tự ghi; luôn bắt đầu bằng OKIA.
  const note = useMemo(() => {
    const who = info?.myCode ?? transferNote(name || user?.displayName || "", 19);
    return transferNote(`OKIA ${who || "cam on"}`);
  }, [info?.myCode, name, user?.displayName]);
  const finalAmount = custom ? Number(custom.replace(/\D/g, "")) || null : amount;

  useEffect(() => {
    if (!info?.bank) return;
    const payload = vietqrPayload({
      bin: info.bank.bin,
      accountNo: info.bank.accountNo,
      amount: finalAmount,
      note,
    });
    let alive = true;
    void import("qrcode").then(({ toDataURL }) =>
      toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: "M" }).then((url) => {
        if (alive) setQr(url);
      }),
    );
    return () => {
      alive = false;
    };
  }, [info?.bank, finalAmount, note]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toaster.success({ title: t("copied", { what: label }) });
    } catch {
      toaster.error({ title: t("copyFailed") });
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  const months = useMemo(() => {
    const m = new Map<string, DonateOut["thanks"]>();
    for (const d of info?.thanks ?? []) m.set(d.month, [...(m.get(d.month) ?? []), d]);
    return [...m.entries()];
  }, [info?.thanks]);

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

        <Grid templateColumns={{ base: "1fr", md: "3fr 2fr" }} gap={{ base: 4, md: 5 }}>
          <Stack layerStyle="sticker" p={5} gap={4} color="ink" data-testid="donate-bank">
            {info?.bank ? (
              <>
                <Heading size="lg">{t("bankTitle")}</Heading>
                <HStack gap={2} flexWrap="wrap">
                  {AMOUNTS.map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      variant="sticker"
                      bg={!custom && amount === a ? "sun" : "paper"}
                      onClick={() => {
                        setAmount(a);
                        setCustom("");
                      }}
                    >
                      {fmt(a)}đ
                    </Button>
                  ))}
                  <Input
                    size="sm"
                    w="32"
                    placeholder={t("customAmount")}
                    inputMode="numeric"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    bg="paper"
                    border="sticker"
                  />
                </HStack>
                {!info.myCode ? (
                  <Input
                    size="sm"
                    placeholder={t("namePlaceholder")}
                    value={name}
                    maxLength={19}
                    onChange={(e) => setName(e.target.value)}
                    bg="paper"
                    border="sticker"
                    data-testid="donate-name"
                  />
                ) : (
                  <Text fontSize="sm" opacity={0.8}>
                    {t("codeHint", { code: info.myCode })}
                  </Text>
                )}
                <HStack align="flex-start" gap={4} flexWrap="wrap">
                  <Box
                    w="200px"
                    h="200px"
                    bg="paper"
                    border="sticker"
                    borderRadius="lg"
                    overflow="hidden"
                    flexShrink={0}
                  >
                    {qr ? (
                      <Image src={qr} alt="VietQR" w="full" h="full" data-testid="donate-qr" />
                    ) : null}
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
                    {finalAmount ? (
                      <Row label={t("amount")} value={`${fmt(finalAmount)}đ`} />
                    ) : null}
                    <Text fontSize="xs" opacity={0.75}>
                      {t("noteHint")}
                    </Text>
                  </Stack>
                </HStack>
              </>
            ) : (
              <Text>{info ? t("noBank") : "…"}</Text>
            )}
            {info?.kofiUrl ? (
              <Button asChild variant="sticker" bg="mint" alignSelf="flex-start">
                <a href={info.kofiUrl} target="_blank" rel="noreferrer">
                  <LuCoffee /> {t("kofi")}
                </a>
              </Button>
            ) : null}
            <Text fontSize="xs" opacity={0.75}>
              {t("legal")}
            </Text>
          </Stack>

          <Stack layerStyle="sticker" p={5} gap={3} color="ink" data-testid="donate-thanks">
            <HStack justify="space-between">
              <Heading size="lg">
                <LuHeart style={{ display: "inline" }} /> {t("thanksTitle")}
              </Heading>
              {info ? (
                <Badge bg="sun" color="ink" border="2px solid" borderColor="ink">
                  {t("thanksCount", { n: String(info.count) })}
                </Badge>
              ) : null}
            </HStack>
            {months.length === 0 ? (
              <Text fontSize="sm" opacity={0.8}>
                {t("thanksEmpty")}
              </Text>
            ) : (
              months.map(([month, list]) => (
                <Stack key={month} gap={1}>
                  <Text fontSize="xs" fontWeight="700" opacity={0.7} textTransform="uppercase">
                    {month}
                  </Text>
                  <HStack gap={1} flexWrap="wrap">
                    {list.map((d, i) => (
                      <Badge
                        key={`${month}-${i}`}
                        bg={d.mine ? "mint" : "paper"}
                        color="ink"
                        border="2px solid"
                        borderColor="ink"
                        borderRadius="full"
                        px={2}
                        textTransform="none"
                        fontFamily="hand"
                      >
                        {d.name}
                        {d.mine ? ` · ${t("you")}` : ""}
                      </Badge>
                    ))}
                  </HStack>
                </Stack>
              ))
            )}
            <Text fontSize="xs" opacity={0.75}>
              {t("thanksHint")}
            </Text>
          </Stack>
        </Grid>
      </Stack>
    </Container>
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
