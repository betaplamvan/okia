import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * Theme "vở ô li": nền giấy, lưới mờ, mực bút bi xanh (người chơi 0) và
 * mực đỏ (người chơi 1). Tên token giữ tiếng Anh để khớp Chakra.
 */
const config = defineConfig({
  globalCss: {
    html: {
      height: "100%",
      // Chữ có dấu tiếng Việt cần line-height rộng hơn mặc định một chút.
      lineHeight: "1.6",
    },
    body: {
      minHeight: "100dvh",
      bg: "bg",
      color: "fg",
      // Vùng an toàn cho tai thỏ / thanh điều hướng trên điện thoại.
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: "var(--font-sans), system-ui, sans-serif" },
        body: { value: "var(--font-sans), system-ui, sans-serif" },
        hand: { value: "var(--font-hand), var(--font-sans), cursive" },
      },
      colors: {
        // Mực bút bi xanh — màu của người chơi 0 và màu thương hiệu.
        ink: {
          50: { value: "#eef3fe" },
          100: { value: "#d9e4fd" },
          200: { value: "#b3c8fa" },
          300: { value: "#86a5f4" },
          400: { value: "#577eea" },
          500: { value: "#1e4fd8" },
          600: { value: "#1a42b4" },
          700: { value: "#17378f" },
          800: { value: "#142d6e" },
          900: { value: "#11244f" },
          950: { value: "#0a1530" },
        },
        // Mực đỏ — màu của người chơi 1.
        redink: {
          50: { value: "#fdeeec" },
          100: { value: "#fbd8d3" },
          200: { value: "#f6b1a8" },
          300: { value: "#ef857a" },
          400: { value: "#e4574a" },
          500: { value: "#d8341e" },
          600: { value: "#b42a18" },
          700: { value: "#8f2214" },
          800: { value: "#6e1b11" },
          900: { value: "#4f140d" },
          950: { value: "#300c08" },
        },
        // Giấy vở: trắng ngà ở chế độ sáng, bảng đen ở chế độ tối.
        paper: {
          light: { value: "#fbf8f1" },
          grid: { value: "#c9d8f0" },
          dark: { value: "#1f2426" },
          gridDark: { value: "#3a4447" },
        },
      },
    },
    semanticTokens: {
      colors: {
        ink: {
          solid: { value: "{colors.ink.500}" },
          contrast: { value: "white" },
          fg: { value: { _light: "{colors.ink.700}", _dark: "{colors.ink.300}" } },
          muted: { value: { _light: "{colors.ink.100}", _dark: "{colors.ink.900}" } },
          subtle: { value: { _light: "{colors.ink.50}", _dark: "{colors.ink.950}" } },
          emphasized: { value: { _light: "{colors.ink.200}", _dark: "{colors.ink.800}" } },
          focusRing: { value: "{colors.ink.500}" },
        },
        redink: {
          solid: { value: "{colors.redink.500}" },
          contrast: { value: "white" },
          fg: { value: { _light: "{colors.redink.700}", _dark: "{colors.redink.300}" } },
          muted: { value: { _light: "{colors.redink.100}", _dark: "{colors.redink.900}" } },
          subtle: { value: { _light: "{colors.redink.50}", _dark: "{colors.redink.950}" } },
          emphasized: { value: { _light: "{colors.redink.200}", _dark: "{colors.redink.800}" } },
          focusRing: { value: "{colors.redink.500}" },
        },
        // Ghi đè nền/chữ mặc định của Chakra để toàn app có tông giấy vở.
        bg: {
          DEFAULT: { value: { _light: "{colors.paper.light}", _dark: "{colors.paper.dark}" } },
        },
        border: {
          DEFAULT: { value: { _light: "{colors.paper.grid}", _dark: "{colors.paper.gridDark}" } },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
