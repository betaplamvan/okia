# 14 — Thiết kế giao diện

Phong cách: **"sticker vở ô li"** — thẻ màu kẹo và giấy kem với viền đen dày, bóng đổ cứng lệch góc, chữ viết tay, trên nền xanh lục đậm có lưới ô li mờ. Học từ [noitu.fun](https://www.noitu.fun/) (đã khảo sát 2026-10-20 bằng ảnh chụp và computed style); **không sao chép asset hay bố cục y nguyên**, chỉ dùng chung ngôn ngữ hình ảnh.

## Token (nguồn chuẩn: `web/src/theme/index.ts`)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `colors.ink` | `#1a2826` | Viền, bóng, chữ trên thẻ |
| `colors.paper` | `#fffcf2` | Thẻ nội dung, nút, bàn đấu |
| `colors.cream` | `#f5f1e8` | Chữ trên nền xanh |
| `colors.board.*` | `#35544a` nền, `#5b9984` sáng ở đỉnh | Nền trang (gradient tỏa từ trên) |
| `colors.mint` | `#7cf5c5` | Thẻ "Chơi với máy", đếm giờ, trạng thái tốt |
| `colors.coral` | `#ff6b6b` | Thẻ "Xếp hạng", cảnh báo, đầu hàng |
| `colors.pink` | `#ff6fbc` | Thẻ "Phòng riêng" |
| `colors.sun` | `#ffd93d` | Thẻ "Bảng xếp hạng", mẹo, nổi bật |
| `colors.pen.blue` / `colors.pen.red` | `#1e4fd8` / `#d8341e` | Nét vẽ người chơi 0 / 1 trên bàn đấu |
| `shadows.sticker` | `5px 5px 0 0 rgba(26,40,38,.85)` | Mọi thẻ và nút |
| `shadows.stickerSm` | `2px 2px 0 0 rgba(26,40,38,.85)` | Trạng thái nhấn |
| `radii.sticker` | `24px` | Thẻ |
| `borders.sticker` | `3px solid {colors.ink}` | Thẻ, nút |
| `fonts.hand` | Patrick Hand | **Mọi chữ** (tiêu đề, thân, nút, số) |
| `fonts.sans` | Be Vietnam Pro | Chỉ cho văn bản dài (chính sách, điều khoản) |

**Một theme cố định**, không có chế độ sáng/tối (quyết định 2026-10-20: thống nhất với mẫu, đồng thời bỏ toàn bộ code color mode từng gây lỗi hydration trên React 19.3). Có thể thêm lại sau nếu người chơi yêu cầu.

## Thành phần

| Tên | Mô tả | Cách dùng |
|---|---|---|
| **Sticker card** | Nền màu (paper/mint/coral/pink/sun), viền `sticker`, bo `sticker`, bóng `sticker`; chấm tròn nhỏ màu đối lập ở góc trên phải làm trang trí | `<Box layerStyle="sticker" bg="mint">` |
| **Pill button** | Nền paper, viền sticker, bo tròn hoàn toàn, chữ hand 600; nhấn → dịch `(3px, 3px)` và bóng thu về `stickerSm` | `<Button variant="sticker">`; màu: `bg="mint"` |
| **Round icon button** | Như pill, hình tròn 44px+ | `<IconButton variant="sticker" rounded="full">` |
| **Timer ring** | Vòng tròn viền mint 6px trên nền paper, số ở giữa (hand, đậm) | Màn chơi (P0-12 / P1-20) |
| **Panel** | Sticker card nền paper chứa HUD / bàn đấu | Màn chơi |
| **Bong bóng bot** | Tròn mint, viền sticker, góc dưới phải | Lời thoại bot (giai đoạn 3) |
| **Huy hiệu hạng** | Khiên SVG viền mực + bóng cứng, màu theo bậc (giấy, mint, sun, pink, coral, xanh–vàng Trạng nguyên), sao bậc con dưới khiên | `<RankEmblem rank size position />` — hồ sơ 112, BXH 44, pill 16–28 (xem [07](07-xep-hang-ghep-tran.md)) |
| **Nền** | `board.*` gradient + lưới ô li mờ 32px (`rgba(255,255,255,.06)`) | `globalCss` |

Chuyển động: chỉ `transform`/`box-shadow` khi nhấn (120 ms), tôn trọng `prefers-reduced-motion`.

## Bố cục trang chủ

```
┌──────────────────────────────┐
│  Ô Kìa                  [EN] │  header trong suốt
│ ┌──────────────────────────┐ │
│ │        Ô Kìa  (hero)     │ │  sticker card nền ink mờ, chữ cream, text-shadow
│ │  trò ăn ô trên giấy ô li │ │
│ └──────────────────────────┘ │
│ ┌───────────┐ ┌───────────┐  │
│ │ 🎮 mint   │ │ ⚔ coral   │  │  2×2 (1 cột ở base): Chơi với máy, Xếp hạng,
│ └───────────┘ └───────────┘  │  Phòng riêng, Bảng xếp hạng — tiêu đề + mô tả
│ ┌───────────┐ ┌───────────┐  │  + icon tròn + nút mũi tên tròn góc dưới phải
│ │ 👥 pink   │ │ 🏆 sun    │  │
│ └───────────┘ └───────────┘  │
│       (ⓘ)  (?)  (⇪)          │  nút tròn phụ
└──────────────────────────────┘
```

Màn chơi (`/play`): không header; bàn đấu là một panel paper vuông ở giữa; HUD hai bên/trên dưới theo [11](11-responsive-i18n.md#bố-cục-màn-chơi); timer ring mint; nút đầu hàng coral.

## Nhận diện (logo, favicon)

Chốt 2026-10-21 (mẫu K, bản v3 "mềm và đơn giản", sau hai vòng A và E–H): **mark "một nét"** —
ô bo tròn chỉ có nét viền (không tô, không chấm, không bóng) và dấu mũ là một nét cong, cùng một màu;
đọc thành chữ **ô**. Logo ngang = mark thay chữ ô + chữ **kìa** viết thường (Quicksand Bold, đã chuyển
thành path). Chữ trong UI vẫn là Patrick Hand; Quicksand chỉ có trong logo. Ở cỡ 16–32px ô được tô
mint và nét dày hơn cho đỡ rỗng; icon app/PWA là nét mực trên nền mint.

| File | Dùng ở |
|---|---|
| `web/public/brand/mark.svg`, `mark-dark.svg` | mark đơn (nét ink cho nền sáng / nét giấy cho nền tối) |
| `web/public/brand/logo.svg`, `logo-dark.svg` | logo ngang (header dùng bản dark) |
| `web/public/brand/logo-hero.svg` | bảng hiệu trang chủ (học noitu.fun, 2026-10-21): mark giấy + "kìa" san hô + ".io.vn" mint, đặt trên thẻ nền `board.deep` viền sticker; tagline bắt đầu bằng "Okia.io.vn –" |
| `web/public/brand/wordmark.svg`, `wordmark-dark.svg` | chữ "ô kìa" thuần, khi cần đặt cạnh mark lớn |
| `web/public/brand/logo-email.png` | logo trong thư (client mail không hiện SVG) |
| `web/src/app/icon.svg`, `favicon.ico` (16 lược, 32, 48), `apple-icon.png` | favicon theo quy ước file của Next |
| `web/public/brand/icon-192.png`, `icon-512.png` + `src/app/manifest.ts` | PWA / thêm vào màn hình chính, nền mint |
| `web/src/app/[locale]/opengraph-image.png` | ảnh chia sẻ 1200×630 |

Tất cả sinh từ **một nguồn** `web/scripts/build-brand.mjs` (`pnpm assets:brand`): sửa mark ở đó rồi chạy
lại, không sửa tay file xuất ra. Các bản thăm dò (A hộp đội mũ, E–H, I–L) nằm trong canvas thiết kế, không
đưa vào repo.

## Khả năng tiếp cận
- Chữ ink trên các màu kẹo đều đạt tương phản ≥ 4.5:1 (ink rất tối). Chữ cream trên nền xanh ≥ 7:1.
- Mọi nút ≥ 44×44px; trạng thái focus: viền ngoài `3px` màu `sun`.
- Icon luôn kèm chữ hoặc `aria-label`.
