# 08 — Hệ thống skin

Quyết định: [ADR-0013](adr/0013-skin-but-o-nam-bac-hiem.md) (2026-10-21). **Đã làm:** catalog 19 skin, engine, shop `/shop`, mua/trang bị, loadout trong trận. Code: `shared/skins/` (manifest), `web/src/game/skins/`, `web/src/game/renderer/board-renderer.ts` (hiệu ứng), `api/app/skins/` (catalog, kho, shop).

## Hai loại skin

| Loại | Ảnh hưởng | Skin hiện có |
|---|---|---|
| `pen` — Bút | **Một gói trọn:** nét vẽ (bề dày, mờ, run tay, đầu nét, nét đứt, thanh đậm, quầng sáng, cầu vồng), **bộ tiếng ăn ô / combo riêng**, **kiểu chữ COMBO**, **loại vụn** bắn ra, mốc combo bắt đầu rung bàn | Bút bi (default), Bút chì 2B, Bút dạ, Sáp màu, Bút mực tím, Phấn trắng, Bút neon, Bút lông, Bút vàng, Bút cầu vồng |
| `box` — Ô đã ăn | Hình tô vào ô khi chiếm + loại vụn | Gạch chéo (default), Tô kín, Gạch ca-rô, Chấm bi, Nguệch ngoạc, Ngôi sao, Dấu 10 điểm, Trái tim, Con dấu vàng |

Mỗi người chơi trang bị một skin mỗi loại (`loadouts`). Trong trận, **mỗi bên thấy bút/ô của chính người vẽ** (gửi trong `room_state.loadouts`, key = user id); chơi với máy thì máy dùng skin mặc định. Màu bút vẫn là màu ghế (xanh/đỏ) để phân biệt hai người — skin chỉ đổi *cách* vẽ (bút cầu vồng pha màu ghế với vòng màu).

## Năm bậc hiếm

| `rarity` | Màu | Giá | Ví dụ |
|---|---|---|---|
| `common` | **Trắng** `#fffcf2` | 100 Ruột chì (default: miễn phí) | Bút chì 2B, Tô kín |
| `uncommon` | **Xanh lá** `#7cf5c5` | 250 Ruột chì | Bút dạ, Sáp màu, Gạch ca-rô, Chấm bi |
| `rare` | **Xanh lam** `#8ec5ff` | 600 Ruột chì | Bút mực tím, Phấn trắng, Nguệch ngoạc, Ngôi sao |
| `epic` | **Tím** `#c9a7ff` | 1 500 Ruột chì | Bút neon, Bút lông, Dấu 10 điểm, Trái tim |
| `legendary` | **Vàng** `#ffd93d` | **5 Hoa điểm tốt** | Bút vàng, Bút cầu vồng, Con dấu vàng |

Giá cố định trong `api/app/skins/catalog.py` (`RARITY_PRICE`) và `web/src/game/skins/skins.ts`; manifest không ghi giá. Thẻ trong shop viền và bóng theo màu bậc.

## Manifest

Nguồn chuẩn: `shared/skins/<type>/<id>.json`. `pnpm gen:skins` kiểm tra (id khớp tên file, đủ `name`/`description` vi + en, enum hợp lệ, đúng một `default` mỗi loại) rồi sinh `api/app/skins/catalog.json` + `web/src/game/skins/catalog.data.ts`. **Không sửa tay** hai file sinh.

```json
{
  "id": "pen_ink_purple",
  "type": "pen",
  "rarity": "rare",
  "name": { "vi": "Bút mực tím", "en": "Purple Ink Pen" },
  "description": { "vi": "Mực tím học trò; ăn ô là mực bắn tung tóe.", "en": "…" },
  "pen":   { "width": 1.1, "alpha": 0.95, "jitter": 0.8, "taper": true },
  "combo": { "style": "ink", "particles": "ink", "shakeFrom": 3 },
  "sfx":   { "capture": "capture_ink", "combo": "combo_ink" }
}
```

| Trường `pen` | Ý nghĩa |
|---|---|
| `width` | hệ số bề dày so với nét mặc định |
| `alpha` | độ mờ |
| `jitter` | hệ số run tay (1 = mặc định; 2B/sáp > 2) |
| `cap` | `round` \| `square` (bút dạ) |
| `taper` | thanh đậm: mảnh hai đầu, dày giữa (bút lông, mực) |
| `glow` | màu quầng sáng dưới nét (neon, vàng) |
| `dash` | `[vẽ, hở]` theo tỷ lệ ô — nét đứt (phấn) |
| `hue` | `rainbow`: mỗi cạnh một màu vòng màu pha với màu ghế |

`combo.style` ∈ `sticker` (vàng viền đen, mặc định) · `ink` (màu bút, viền giấy, xoay mạnh) · `chalk` (trắng, không viền) · `neon` (màu glow, viền màu bút) · `sparkle` (vàng + thêm chùm sao). `combo.particles` và `box.particles` ∈ `paper` (vụn giấy, có trọng lực) · `ink` (giọt mực) · `chalk` (bụi trắng, rơi chậm) · `spark` (tia, không rơi) · `star` (sao vàng). `sfx.capture`/`sfx.combo` là tên trong audio sprite; tên lạ → engine dùng `capture`/`combo` mặc định.

```json
{
  "id": "box_stamp10",
  "type": "box",
  "rarity": "epic",
  "name": { "vi": "Dấu 10 điểm", "en": "Perfect 10 Stamp" },
  "description": { "vi": "…", "en": "…" },
  "box": { "effect": "stamp", "alpha": 0.3, "particles": "paper" }
}
```

`box.effect` ∈ `hatch` · `fill` · `crosshatch` · `dots` · `scribble` · `star` · `stamp` (vòng tròn + chữ "10", đóng từ trên xuống) · `heart` · `seal` (dấu tròn vàng + sao màu bút). Danh sách cố định trong engine (`drawBoxEffect`); thêm skin mới chỉ cần chọn hiệu ứng và tham số.

## Animation trong trận

| Sự kiện | Hiệu ứng |
|---|---|
| Hover/chạm gần cạnh | Cạnh hiện mờ bằng chính bút của mình |
| Vẽ cạnh | Nét chạy từ chấm đầu đến chấm cuối (180 ms) theo tham số bút |
| Ăn ô | `box.effect` + vụn theo `box.particles`; `stamp`/`seal` đóng từ to xuống, còn lại nảy từ nhỏ lên |
| Ăn chuỗi | Chữ "COMBO ×n" theo `combo.style` của **bút người vừa đi**, vụn theo `combo.particles`, rung bàn từ `combo.shakeFrom` |
| Lượt chuyển | Thanh timer đổi bên |
| Kết thúc | Đếm ô từng người (ô nảy lần lượt + số to giữa bàn, tiếng "pop" cao dần), xong mới hiện kết quả |

Thiết bị bật "Giảm hiệu ứng" (`prefers-reduced-motion`) → tắt particle, rung, chữ nổ và bỏ qua đếm ô.

## Âm thanh

- **Audio sprite** (một file `core.webm` + `core.mp3` dự phòng) qua Howler; `web/scripts/build-audio.mjs` gộp `shared/audio/core/*` + `shared/audio/ui/*`, chạy trước `dev`/`build`. Mọi tiếng trong game tổng hợp bởi `scripts/synth-sfx.mjs` (tất định, có seed); nguồn ngoài ghi ở [credits.md](credits.md).
- **Bộ tiếng theo bút:** `capture` (ting mặc định), `capture_soft` (chì/sáp), `capture_marker` (dạ), `capture_ink` (mực "ục"), `capture_chalk` (gõ phấn), `capture_neon` (blip sóng vuông), `capture_bell` (chuông); `combo` (lấp lánh mặc định), `combo_ink`, `combo_chalk`, `combo_neon`, `combo_bell`.
- **Combo:** ô thứ `n` trong một lượt phát `capture` của bút với `rate = 1 + 0.08 × (n−1)` (tối đa 1.6); từ ô thứ 2 phát thêm `combo` (`rate = 1 + 0.06 × (n−2)`, tối đa 1.5). Hai tiếng là của **bút người vừa đi** (`use-game-sounds.ts` đọc `SeatSkins`).
- Rung (`navigator.vibrate`) 15 ms khi ăn ô, mẫu `[15, 30, 25]` từ combo ×3.

## Shop & trang bị

- `/shop`: tab **Bút** / **Ô đã ăn**, lưới 2 cột trên điện thoại (3–4 trên desktop), ví ở đầu trang; thẻ = xem trước SVG tĩnh + tên + bậc (màu) + giá; **Thử** mở bàn mẫu 3×3 thật (BoardCanvas) với nút "Vẽ thử" đi từng nước theo kịch bản có ăn 2 ô liên tiếp để nghe tiếng và thấy COMBO; **Mua** (hộp xác nhận) → **Trang bị** → "Đang dùng". Khách xem/thử được, mua/trang bị mời đăng nhập Google.
- API: `GET /skins` (catalog), `GET /me/skins` (sở hữu, loadout, ví, `canBuy`), `POST /me/skins/{id}/buy`, `PUT /me/loadout` `{pen?, box?}`; `/me` có `loadout`. Lỗi: `UNKNOWN_ITEM`, `ALREADY_OWNED`, `NOT_OWNED`, `INSUFFICIENT_FUNDS`.
- Lối vào: nút giỏ hàng ở trang chủ (hàng nút tròn) và trong hộp thoại hồ sơ. Smoke: `pnpm smoke:shop`.

## Quy trình thêm skin

1. Viết manifest `shared/skins/<type>/<id>.json` (chọn hiệu ứng/tham số có sẵn; cần tiếng mới thì thêm generator vào `web/scripts/synth-sfx.mjs` rồi `node scripts/synth-sfx.mjs` + `pnpm assets:audio`).
2. `pnpm gen:skins` → hai bản sinh; test `api/tests/test_skins.py` và `web` (typecheck) phải xanh.
3. Xem trên `/shop` → Thử. Không cần seed DB hay upload asset.

Chưa làm (giữ ở lộ trình): skin `board` (bàn đấu), rương/bộ sưu tập (ADR-0007), tủ trưng bày, skin `reward` theo mùa/sự kiện.
