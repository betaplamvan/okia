"use client";

import { Button, Group } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const LABELS: Record<Locale, string> = { vi: "VI", en: "EN" };

// Đổi ngôn ngữ tại chỗ: giữ đường dẫn hiện tại, chỉ thay locale.
// next-intl ghi cookie NEXT_LOCALE qua proxy khi điều hướng.
export function LanguageSwitcher() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <Group attached role="group" aria-label={t("language")}>
      {routing.locales.map((code) => (
        <Button
          key={code}
          size="sm"
          variant={code === locale ? "solid" : "outline"}
          colorPalette="ink"
          aria-pressed={code === locale}
          disabled={isPending}
          onClick={() => switchTo(code)}
        >
          {LABELS[code]}
        </Button>
      ))}
    </Group>
  );
}
