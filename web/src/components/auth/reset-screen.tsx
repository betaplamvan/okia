"use client";

import { Button, Container, Field, Heading, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { TextInput } from "@/components/auth/account-tab";
import { toaster } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import { api, ApiError, type TokenOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export function ResetScreen() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const token = useSearchParams().get("token") ?? "";
  const applyToken = useAuth((s) => s.applyToken);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const tok = await api<TokenOut>("/auth/reset", {
        body: { token, password: String(f.get("password")) },
        locale,
      });
      applyToken(tok);
      setDone(true);
    } catch (err) {
      toaster.error({
        title: err instanceof ApiError && err.message ? err.message : t("errorGeneric"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxW="md" px={4} py={10} flex="1">
      <Stack layerStyle="sticker" p={6} gap={4}>
        <Heading size="2xl" color="ink" textAlign="center">
          {t("resetPage.title")}
        </Heading>
        {done ? (
          <Stack textAlign="center" gap={4}>
            <Text role="status">{t("resetPage.success")}</Text>
            <Button asChild variant="sticker" bg="mint" alignSelf="center">
              <Link href="/">{t("verifyPage.home")}</Link>
            </Button>
          </Stack>
        ) : !token ? (
          <Text textAlign="center">{t("verifyPage.failed")}</Text>
        ) : (
          <form onSubmit={submit}>
            <Stack gap={3}>
              <Field.Root required>
                <Field.Label>{t("resetPage.newPassword")}</Field.Label>
                <TextInput
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                />
                <Field.HelperText color="ink" opacity={0.7}>
                  {t("passwordHint")}
                </Field.HelperText>
              </Field.Root>
              <Button type="submit" variant="sticker" bg="mint" loading={busy}>
                {t("resetPage.submit")}
              </Button>
            </Stack>
          </form>
        )}
      </Stack>
    </Container>
  );
}
