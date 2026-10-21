import { createSystem, defaultConfig, defineConfig, defineRecipe } from "@chakra-ui/react";

/**
 * Theme "sticker vở ô li" — đặc tả: docs/14-thiet-ke-giao-dien.md.
 * Một theme cố định (không có chế độ sáng/tối). Tên token giữ tiếng Anh để khớp Chakra.
 */

const buttonRecipe = defineRecipe({
  variants: {
    variant: {
      // Nút "sticker": nền giấy, viền đen dày, bóng cứng; nhấn thì lún xuống.
      sticker: {
        bg: "paper",
        color: "ink",
        borderWidth: "3px",
        borderColor: "ink",
        borderRadius: "full",
        boxShadow: "sticker",
        fontFamily: "hand",
        fontWeight: "600",
        transitionProperty: "transform, box-shadow, background",
        transitionDuration: "fast",
        _hover: { bg: "paperHover" },
        _active: { transform: "translate(3px, 3px)", boxShadow: "stickerSm" },
        _focusVisible: { outline: "3px solid", outlineColor: "sun", outlineOffset: "2px" },
        _disabled: { opacity: 0.6, cursor: "not-allowed", _active: { transform: "none" } },
      },
    },
  },
});

const config = defineConfig({
  globalCss: {
    html: {
      height: "100%",
      // Chữ có dấu tiếng Việt cần line-height rộng hơn mặc định một chút.
      lineHeight: "1.5",
      colorScheme: "dark",
    },
    body: {
      minHeight: "100dvh",
      color: "cream",
      fontFamily: "hand",
      fontSize: "lg",
      // Nền xanh lục có gradient sáng từ đỉnh + lưới ô li mờ.
      backgroundColor: "board.base",
      backgroundImage: [
        "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
        "radial-gradient(at 50% 0%, {colors.board.glow} 0px, {colors.board.base} 70%)",
      ].join(", "),
      backgroundSize: "32px 32px, 32px 32px, 100% 100%",
      backgroundAttachment: "scroll, scroll, fixed",
      // Vùng an toàn cho tai thỏ / thanh điều hướng trên điện thoại.
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
    },
  },
  theme: {
    tokens: {
      fonts: {
        hand: { value: "var(--font-hand), 'Patrick Hand', system-ui, sans-serif" },
        sans: { value: "var(--font-sans), system-ui, sans-serif" },
        heading: { value: "var(--font-hand), 'Patrick Hand', system-ui, sans-serif" },
        body: { value: "var(--font-hand), 'Patrick Hand', system-ui, sans-serif" },
      },
      colors: {
        ink: { value: "#1a2826" },
        paper: { value: "#fffcf2" },
        paperHover: { value: "#fff5d6" },
        cream: { value: "#f5f1e8" },
        board: {
          base: { value: "#35544a" },
          glow: { value: "#5b9984" },
          deep: { value: "#223b33" },
        },
        mint: { value: "#7cf5c5" },
        coral: { value: "#ff6b6b" },
        pink: { value: "#ff6fbc" },
        sun: { value: "#ffd93d" },
        // Màu bút của hai người chơi trên bàn đấu (giấy kem).
        pen: {
          blue: { value: "#1e4fd8" },
          red: { value: "#d8341e" },
        },
      },
      shadows: {
        sticker: { value: "5px 5px 0 0 rgba(26, 40, 38, 0.85)" },
        stickerLg: { value: "8px 10px 0 0 rgba(26, 40, 38, 0.85)" },
        stickerSm: { value: "2px 2px 0 0 rgba(26, 40, 38, 0.85)" },
        stickerText: { value: "0 3px 0 rgba(26, 40, 38, 0.4)" },
      },
      radii: {
        sticker: { value: "24px" },
      },
      borders: {
        sticker: { value: "3px solid {colors.ink}" },
      },
    },
    semanticTokens: {
      colors: {
        // Ghi đè mặc định của Chakra để component thường (Input, Dialog…) cũng theo tông giấy.
        bg: { DEFAULT: { value: "{colors.board.base}" }, panel: { value: "{colors.paper}" } },
        fg: { DEFAULT: { value: "{colors.cream}" }, muted: { value: "rgba(245, 241, 232, 0.8)" } },
        border: { DEFAULT: { value: "{colors.ink}" } },
      },
    },
    layerStyles: {
      sticker: {
        value: {
          bg: "paper",
          color: "ink",
          border: "sticker",
          borderRadius: "sticker",
          boxShadow: "sticker",
        },
      },
    },
    recipes: {
      button: buttonRecipe,
    },
  },
});

export const system = createSystem(defaultConfig, config);
