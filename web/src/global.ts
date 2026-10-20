import type { formats } from "@/i18n/request";
import type { routing } from "@/i18n/routing";
import type messages from "../messages/vi.json";

// Kiểu cho next-intl: locale hợp lệ, key dịch (theo vi.json) và tên format.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
    Formats: typeof formats;
  }
}
