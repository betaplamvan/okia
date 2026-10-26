import {
  createSystem,
  defaultConfig,
  defineConfig,
  defineRecipe,
  defineSlotRecipe,
} from "@chakra-ui/react";

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

// Ô nhập (Input / Textarea / NativeSelect): luôn chữ mực trên nền giấy, viền mực, chữ gợi ý mực mờ.
// Mặc định Chakra lấy `fg` (= kem, cho nền xanh) và html `color-scheme: dark` → chữ gợi ý kem trên
// giấy gần như tàng hình, số gõ vào có thể trắng (trang Thông số admin, 2026-10-23).
const fieldBase = {
  color: "ink",
  bg: "paper",
  colorScheme: "light",
  borderWidth: "2px",
  borderColor: "ink",
  caretColor: "ink",
  _placeholder: { color: "ink", opacity: 0.45 },
  _focusVisible: { outline: "3px solid", outlineColor: "sun", outlineOffset: "1px" },
} as const;
const inputRecipe = defineRecipe({ base: fieldBase });
const textareaRecipe = defineRecipe({ base: fieldBase });

const config = defineConfig({
  globalCss: {
    // Chip người chơi rung khi trúng đồ ném (components/play/interaction-layer.tsx; keyframes ở
    // theme.keyframes.okiaHit).
    ".okia-hit": { animation: "okiaHit 0.45s ease-in-out" },
    // Ô nhập số: bỏ mũi tên tăng/giảm của trình duyệt (lệch phong cách sticker, docs/14).
    // Footer (site-footer.tsx): hover / focus nền sáng nhẹ như noitu.
    ".okia-footer-link:hover, .okia-footer-link:focus-visible": {
      background: "rgba(255, 252, 242, 0.14)",
      color: "{colors.mint}",
      outline: "none",
    },
    'input[type="number"]': { appearance: "textfield" },
    'input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button':
      { appearance: "none", margin: 0 },
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
    keyframes: {
      // Keyframes PHẢI khai báo ở đây (theme.keyframes): viết lồng `"@keyframes x"` trong prop `css`
      // của Chakra thì CSS sinh ra rỗng (`@keyframes x { }`) → animation chạy mà không làm gì (2026-10-26).
      okiaAura: {
        "0%, 100%": { opacity: 0.55, transform: "scale(0.96)" },
        "50%": { opacity: 0.95, transform: "scale(1.04)" },
      },
      okiaEmber: {
        "0%": { transform: "translateY(0)", opacity: 0 },
        "20%": { opacity: 1 },
        "100%": { transform: "translateY(-34px)", opacity: 0 },
      },
      okiaEmote: {
        "0%": { transform: "translate(-50%, 0) scale(0.4)", opacity: 0 },
        "15%": { transform: "translate(-50%, -8px) scale(1.1)", opacity: 1 },
        "85%": { transform: "translate(-50%, -8px) scale(1)", opacity: 1 },
        "100%": { transform: "translate(-50%, -20px) scale(0.9)", opacity: 0 },
      },
      okiaFirstTurn: {
        "0%": { transform: "scale(0.6) rotate(-4deg)", opacity: 0 },
        "12%": { transform: "scale(1.08) rotate(1deg)", opacity: 1 },
        "22%": { transform: "scale(1) rotate(0)", opacity: 1 },
        "85%": { transform: "scale(1)", opacity: 1 },
        "100%": { transform: "scale(0.94)", opacity: 0 },
      },
      okiaFlame: {
        "0%": { transform: "scale(0.9, 0.82) skewX(-5deg)" },
        "50%": { transform: "scale(1.05, 1.06) skewX(3deg)" },
        "100%": { transform: "scale(0.96, 1.16) skewX(-2deg)" },
      },
      okiaNudge: {
        "0%, 100%": { transform: "translateX(0)" },
        "50%": { transform: "translateX(3px)" },
      },
      okiaRankDown: {
        "0%": { transform: "translateY(-14px)", opacity: 0 },
        "100%": { transform: "translateY(0)", opacity: 1 },
      },
      okiaRankUp: {
        "0%": { transform: "scale(0.5) rotate(-8deg)", opacity: 0 },
        "60%": { transform: "scale(1.15) rotate(3deg)", opacity: 1 },
        "100%": { transform: "scale(1) rotate(0)", opacity: 1 },
      },
      okiaShine: {
        "0%": { transform: "skewX(-20deg) translateX(0)" },
        "55%, 100%": { transform: "skewX(-20deg) translateX(210px)" },
      },
      okiaSplat: {
        "0%": { transform: "translate(-50%, -50%) scale(0.2)", opacity: 1 },
        "25%": { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1 },
        "70%": { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95 },
        "100%": { transform: "translate(-50%, -40%) scale(1.05)", opacity: 0 },
      },
      okiaHit: {
        "0%, 100%": { transform: "translate(0,0) rotate(0)" },
        "20%": { transform: "translate(-4px, 2px) rotate(-3deg)" },
        "40%": { transform: "translate(4px, -2px) rotate(3deg)" },
        "60%": { transform: "translate(-3px, 1px) rotate(-2deg)" },
        "80%": { transform: "translate(3px, -1px) rotate(2deg)" },
      },
    },
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
      input: inputRecipe,
      textarea: textareaRecipe,
    },
    slotRecipes: {
      nativeSelect: defineSlotRecipe({
        slots: ["root", "field", "indicator"],
        base: { field: { ...fieldBase, _placeholder: undefined }, indicator: { color: "ink" } },
      }),
    },
  },
});

export const system = createSystem(defaultConfig, config);
