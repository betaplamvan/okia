import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  // Tiếng Việt không có tiền tố (/play), tiếng Anh có (/en/play). Xem docs/11.
  localePrefix: "as-needed",
  // Nhớ lựa chọn ngôn ngữ của khách trong 1 năm (người đã đăng nhập dùng users.locale).
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];
