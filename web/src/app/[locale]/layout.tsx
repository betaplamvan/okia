import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Patrick_Hand } from "next/font/google";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { Provider } from "@/components/ui/provider";
import { routing } from "@/i18n/routing";

// Font viết tay cho toàn bộ giao diện (docs/14); có subset tiếng Việt.
const fontHand = Patrick_Hand({
  variable: "--font-hand",
  subsets: ["latin", "vietnamese"],
  weight: "400",
  display: "swap",
});

// Font sans chỉ dùng cho văn bản dài (chính sách, điều khoản).
const fontSans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600"],
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
  themeColor: "#35544a",
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootParams.locale();
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={`${fontHand.variable} ${fontSans.variable}`}>
      {/* suppressHydrationWarning: extension trình duyệt (ColorZilla, Grammarly…) hay gắn thêm
          thuộc tính vào <body> trước khi hydrate; chỉ bỏ qua lệch thuộc tính trên phần tử này. */}
      <body suppressHydrationWarning>
        <NextIntlClientProvider>
          <Provider>
            <AppShell>{children}</AppShell>
          </Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
