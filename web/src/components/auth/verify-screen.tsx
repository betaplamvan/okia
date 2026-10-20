"use client";

import { Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, ApiError, type TokenOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export function VerifyScreen() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const token = useSearchParams().get("token") ?? "";
  const applyToken = useAuth((s) => s.applyToken);
  // Không có token → lỗi ngay từ render đầu (không setState trong effect).
  const [state, setState] = useState<{ status: "working" | "ok" | "error"; message?: string }>(
    () => ({ status: token ? "working" : "error" }),
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<TokenOut>("/auth/verify", { body: { token }, locale })
      .then((tok) => {
        if (cancelled) return;
        applyToken(tok);
        setState({ status: "ok" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ status: "error", message: e instanceof ApiError ? e.message : undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [token, locale, applyToken]);

  return (
    <Container maxW="md" px={4} py={10} flex="1">
      <Stack layerStyle="sticker" p={6} textAlign="center" gap={4}>
        <Heading size="2xl" color="ink">
          {t("verifyPage.title")}
        </Heading>
        <Text role="status">
          {state.status === "working"
            ? t("verifyPage.working")
            : state.status === "ok"
              ? t("verifyPage.success")
              : (state.message ?? t("verifyPage.failed"))}
        </Text>
        {state.status !== "working" ? (
          <Button asChild variant="sticker" bg="mint" alignSelf="center">
            <Link href="/">{t("verifyPage.home")}</Link>
          </Button>
        ) : null}
      </Stack>
    </Container>
  );
}
