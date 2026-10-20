"use client";

import { Button } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useAuth } from "@/stores/auth";

// Một nút pill hiện ngôn ngữ CÒN LẠI; bấm để chuyển, giữ nguyên đường dẫn.
// next-intl ghi cookie NEXT_LOCALE qua proxy khi điều hướng.
const OTHER: Record<Locale, { locale: Locale; label: string }> = {
  vi: { locale: "en", label: "EN" },
  en: { locale: "vi", label: "VI" },
};

export function LanguageSwitcher() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const target = OTHER[locale];
  const user = useAuth((s) => s.user);
  const updateMe = useAuth((s) => s.updateMe);

  return (
    <Button
      variant="sticker"
      size="sm"
      minW="12"
      aria-label={t("switchLanguage", { language: target.label })}
      disabled={isPending}
      onClick={() => {
        // Người đã có phiên: lưu lựa chọn lên server (users.locale) — docs/11, P1-05.
        if (user) void updateMe({ locale: target.locale }).catch(() => undefined);
        startTransition(() => router.replace(pathname, { locale: target.locale }));
      }}
    >
      {target.label}
    </Button>
  );
}
