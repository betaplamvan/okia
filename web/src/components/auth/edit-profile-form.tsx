"use client";

import { Button, Field, HStack, NativeSelect, Stack } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { TextInput } from "@/components/auth/account-tab";
import { toaster } from "@/components/ui/toaster";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Sửa tên hiển thị + ngôn ngữ (PATCH /me). Đổi ngôn ngữ thì chuyển route theo locale mới.
export function EditProfileForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Auth");
  const user = useAuth((s) => s.user)!;
  const updateMe = useAuth((s) => s.updateMe);
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const locale = String(f.get("locale")) as Locale;
    setBusy(true);
    try {
      await updateMe({ displayName: String(f.get("displayName")), locale });
      toaster.success({ title: t("saved") });
      onDone();
      if (locale !== currentLocale) {
        startTransition(() => router.replace(pathname, { locale }));
      }
    } catch (err) {
      toaster.error({
        title: err instanceof ApiError && err.message ? err.message : t("errorGeneric"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={3} bg="cream" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
        <Field.Root required>
          <Field.Label>{t("displayName")}</Field.Label>
          <TextInput name="displayName" defaultValue={user.displayName} maxLength={32} />
        </Field.Root>
        <Field.Root>
          <Field.Label>{t("language")}</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              name="locale"
              defaultValue={user.locale}
              bg="white"
              color="ink"
              border="2px solid"
              borderColor="ink"
              borderRadius="lg"
              fontFamily="hand"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator color="ink" />
          </NativeSelect.Root>
        </Field.Root>
        <HStack>
          <Button type="submit" size="sm" variant="sticker" bg="mint" loading={busy}>
            {t("save")}
          </Button>
          <Button size="sm" variant="sticker" onClick={onDone}>
            {t("cancel")}
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
