import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    // Sinh messages/vi.d.json.ts để t("...") kiểm tra key và tham số lúc biên dịch.
    createMessagesDeclaration: "./messages/vi.json",
  },
});

const nextConfig: NextConfig = {
  // Dev: cho máy khác trong mạng LAN mở http://<ip-máy-này>:3000 (Next chặn origin lạ mặc định;
  // chỉ ảnh hưởng `next dev`). Next từ chối pattern "*" đơn lẻ nên liệt kê theo dải IP riêng
  // (RFC 1918) + tên máy .local. Kèm theo: NEXT_PUBLIC_API_URL=http://<ip>:8000 trong .env.local
  // và CORS_ORIGINS bên api/.env (xem README).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
};

export default withNextIntl(nextConfig);
