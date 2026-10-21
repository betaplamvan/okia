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
};

export default withNextIntl(nextConfig);
