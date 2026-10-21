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
  // Image Docker (web/Dockerfile) build với NEXT_OUTPUT=standalone → .next/standalone/server.js.
  // Không bật mặc định: trên Windows tạo standalone có thể cần quyền symlink.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  // Asset trong public/ không có hash tên file (sprite âm thanh, logo): để Cloudflare giữ ở edge
  // 1 ngày (s-maxage) và trình duyệt 1 giờ; đổi file thì tối đa một ngày sau mới thấy ở mọi nơi.
  // /_next/static đã immutable 1 năm sẵn (tên có hash).
  async headers() {
    return [
      {
        source: "/:prefix(assets|brand|sounds)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
