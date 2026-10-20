import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Patrick_Hand } from "next/font/google";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import Script from "next/script";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { COLOR_MODE_SCRIPT } from "@/components/ui/color-mode";
import { Provider } from "@/components/ui/provider";
import { routing } from "@/i18n/routing";

// Font UI: có subset tiếng Việt, không phải variable font nên phải khai báo weight.
const fontSans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Font viết tay cho bàn đấu / HUD (next/font xác nhận có subset tiếng Việt khi build).
const fontHand = Patrick_Hand({
  variable: "--font-hand",
  subsets: ["latin", "vietnamese"],
  weight: "400",
  display: "swap",
});

// Prerender cả hai locale (bắt buộc khi bật cacheComponents).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("title"), description: t("description") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Để safe-area-inset-* có hiệu lực trên iOS.
  viewportFit: "cover",
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootParams.locale();
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // suppressHydrationWarning: script color mode gán class "dark"/"light" lên <html> trước khi hydrate.
    <html
      lang={locale}
      className={`${fontSans.variable} ${fontHand.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Chống nháy theme; beforeInteractive chỉ được phép trong root layout. */}
        <Script
          id="okia-color-mode"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }}
        />
        <NextIntlClientProvider>
          <Provider>
            <AppShell>{children}</AppShell>
          </Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
