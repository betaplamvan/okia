import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Mặc định chạy trong Node (luật chơi, bot, i18n là code thuần).
    // Test component React tự khai báo `// @vitest-environment jsdom` ở đầu file.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Fixtures dùng chung với backend nằm ngoài web/.
    passWithNoTests: false,
  },
});
