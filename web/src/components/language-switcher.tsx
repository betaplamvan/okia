"use client";

import { Button } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

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

  return (
    <Button
      variant="sticker"
      size="sm"
      minW="12"
      aria-label={t("switchLanguage", { language: target.label })}
      disabled={isPending}
      onClick={() => startTransition(() => router.replace(pathname, { locale: target.locale }))}
    >
      {target.label}
    </Button>
  );
}
