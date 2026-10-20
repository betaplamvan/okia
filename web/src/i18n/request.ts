import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale, type Formats } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export const formats = {
  dateTime: {
    short: { day: "numeric", month: "short", year: "numeric" },
  },
  number: {
    // Ruột chì, điểm số: số nguyên có phân cách hàng nghìn theo locale.
    integer: { maximumFractionDigits: 0 },
  },
} satisfies Formats;

export default getRequestConfig(async ({ locale }) => {
  // Không có locale truyền tay (Route Handler / Server Action) → đọc từ segment [locale].
  if (!locale) {
    const candidate = await rootParams.locale();
    if (hasLocale(routing.locales, candidate)) {
      locale = candidate;
    } else {
      notFound();
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Ho_Chi_Minh",
    formats,
  };
});
