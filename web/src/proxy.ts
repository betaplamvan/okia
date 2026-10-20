import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Next 16 gọi middleware là "proxy". next-intl lo việc đoán locale, redirect/rewrite và cookie.
export default createMiddleware(routing);

export const config = {
  // Bỏ qua API, tài nguyên nội bộ của Next và các đường dẫn có dấu chấm (file tĩnh).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
