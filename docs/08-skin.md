# 08 — Hệ thống skin

Quyết định: [ADR-0013](adr/0013-skin-but-o-nam-bac-hiem.md) (2026-10-21; bổ sung cùng ngày: bút hai hình thái). **Đã làm:** catalog 20 skin, engine, shop `/shop`, mua/trang bị, loadout trong trận. Code: `shared/skins/` (manifest), `web/src/game/skins/`, `web/src/game/renderer/board-renderer.ts` (hiệu ứng), `api/app/skins/` (catalog, kho, shop).

## Hai loại skin

| Loại | Ảnh hưởng | Skin hiện có |
|---|---|---|
| `pen` — Bút | **Một gói trọn:** nét vẽ (kiểu nét `style` + hai hình thái màu, bề dày, mờ, run tay, đầu nét, nét đứt, thanh đậm, hạt), **bộ tiếng ăn ô / combo riêng**, **kiểu chữ COMBO**, **loại vụn** bắn ra, mốc combo bắt đầu rung bàn | Bút bi (default), Bút chì 2B, Bút dạ, Sáp màu, Bút mực tím, Phấn màu, Bút neon, Bút lông, Bút lửa, Bút cầu vồng, Bút vàng |
| `box` — Ô đã ăn | Hình tô vào ô khi chiếm + loại vụn | Gạch chéo (default), Tô kín, Gạch ca-rô, Chấm bi, Nguệch ngoạc, Ngôi sao, Dấu 10 điểm, Trái tim, Con dấu vàng |

Mỗi người chơi trang bị một skin mỗi loại (`loadouts`). Trong trận, **mỗi bên thấy bút/ô của chính người vẽ** (gửi trong `room_state.loadouts`, key = user id); chơi với máy thì máy dùng skin mặc định.

**Hai hình thái của bút.** Mỗi bút có hai bộ màu: `mine` (tông **lạnh**) và `opponent` (tông **nóng**). Engine áp hình thái theo *phía nhìn*: ghế bằng `session.human` dùng `mine`, ghế kia dùng `opponent` — nên **cả hai người đều thấy nét của mình lạnh, nét đối thủ nóng**, vẫn phân biệt được hai bên dù cùng bút. Màu nét, màu tô ô đã ăn (skin ô giữ hiệu ứng, lấy màu từ hình thái bút của người ăn), chữ COMBO, quầng sáng, vụn đều theo hình thái; bề dày / run tay / nét đứt / thanh đậm / tiếng dùng chung. Nét xem trước (hover) dùng hình thái `mine`. `colors.pens` của renderer chỉ còn là dự phòng.

## Năm bậc hiếm

| `rarity` | Màu | Giá | Ví dụ |
|---|---|---|---|
| `common` | **Trắng** `#fffcf2` | 100 Ruột chì (default: miễn phí) | Bút chì 2B, Tô kín |
| `uncommon` | **Xanh lá** `#7cf5c5` | 250 Ruột chì | Bút dạ, Sáp màu, Gạch ca-rô, Chấm bi |
| `rare` | **Xanh lam** `#8ec5ff` | 600 Ruột chì | Bút mực tím, Phấn màu, Nguệch ngoạc, Ngôi sao |
| `epic` | **Tím** `#c9a7ff` | 1 500 Ruột chì | Bút neon, Bút lông, Dấu 10 điểm, Trái tim |
| `legendary` | **Vàng** `#ffd93d` | **5 Hoa điểm tốt** | Bút lửa, Bút cầu vồng, Bút vàng, Con dấu vàng |

Giá cố định trong `api/app/skins/catalog.py` (`RARITY_PRICE`) và `web/src/game/skins/skins.ts`; manifest không ghi giá. Thẻ trong shop viền và bóng theo màu bậc.

## Manifest

Nguồn chuẩn: `shared/skins/<type>/<id>.json`. `pnpm gen:skins` kiểm tra (id khớp tên file, đủ `name`/`description` vi + en, enum hợp lệ, đúng một `default` mỗi loại; bút: `pen.style` trong enum, `forms.mine`/`forms.opponent` có `color` hex hợp lệ và **khác nhau**, `rainbow`/`metal` phải có `colors`) rồi sinh `api/app/skins/catalog.json` + `web/src/game/skins/catalog.data.ts`. **Không sửa tay** hai file sinh.

```json
{
  "id": "pen_ink_purple",
  "type": "pen",
  "rarity": "rare",
  "name": { "vi": "Bút mực tím", "en": "Purple Ink Pen" },
  "description": { "vi": "Mực tím học trò; ăn ô là mực bắn tung tóe.", "en": "…" },
  "forms": {
    "mine":     { "color": "#4a2d9c", "color2": "#8f6ad6" },
    "opponent": { "color": "#9c1f6e", "color2": "#e26bb4" }
  },
  "pen":   { "style": "gradient", "width": 1.1, "alpha": 0.95, "jitter": 0.8, "taper": true },
  "combo": { "style": "ink", "particles": "ink", "shakeFrom": 3 },
  "sfx":   { "capture": "capture_ink", "combo": "combo_ink" }
}
```

| Trường `forms.mine` / `forms.opponent` | Ý nghĩa |
|---|---|
| `color` | màu chính (bắt buộc, hex) — nét, ô đã ăn, vụn |
| `color2` | màu cuối gradient (mực, phấn, lông, lửa) |
| `colors` | mảng mốc màu nhiều điểm (cầu vồng, kim loại) |
| `glow` | màu quầng sáng (neon, vàng); cũng là màu chữ COMBO kiểu `neon`/`sparkle` |
| `core` | màu lõi sáng giữa nét (neon) |
| `accent` | màu chấm sáp (sáp màu) |

| Trường `pen` | Ý nghĩa |
|---|---|
| `style` | kiểu nét: `flat` (phẳng) · `twotone` (viền đậm `color2` rộng ×1.6 dưới lõi `color`) · `gradient` (`color` → `color2` dọc nét — PixiJS không có gradient cho stroke nên vẽ từng đoạn con) · `neon` (quầng `glow` ×2.6 **thở** 0.25–0.45 chu kỳ 1.2 s + lõi `core`) · `brush` (thanh đậm 0.4×→1.5× + gradient + halo mực loang `color2` nở ×1→×2.2 trong 0.6 s) · `fire` (lõi sáng + nét + **lửa liên tục** bay lên dọc nét, trần ~60 hạt/bàn, tốc độ sinh theo số cạnh; ăn ô là ô bùng cháy) · `rainbow` (gradient nhiều mốc `colors` **trôi** 2 s/chu kỳ, vẽ lại mỗi ~50 ms) · `metal` (gradient `colors` + quầng `glow` + **vệt ánh kim** chạy dọc nét mỗi ~3 s + sao lóe hiếm) |
| `width` | hệ số bề dày so với nét mặc định |
| `alpha` | độ mờ |
| `jitter` | hệ số run tay (1 = mặc định; 2B/sáp > 2) |
| `cap` | `round` \| `square` (bút dạ) |
| `taper` | thanh đậm: mảnh hai đầu, dày giữa (mực) |
| `dash` | `[vẽ, hở]` theo tỷ lệ ô — nét đứt (phấn) |
| `grain` | `graphite` (vệt chì mảnh lệch bên, bút chì 2B) · `wax` (chấm sáp sẫm màu `accent`, sáp màu) |
| `halo` | quầng bụi `color2` rộng mờ dưới nét (phấn) |

Hiệu ứng chạy liên tục (thở, lửa, trôi, ánh kim) đi qua `app.ticker` của renderer; bật "Giảm hiệu ứng" → tất cả **tĩnh**. Hiệu năng: quầng neon chỉ đổi alpha (không vẽ lại); mỗi cạnh animate vẽ lại tối đa một lần / ~50 ms; hạt lửa dùng pool Graphics (chỉ đổi vị trí / scale / tint), trần 60 hạt.

| Bút | Bậc | `style` | `mine` → `opponent` |
|---|---|---|---|
| Bút bi | trắng | `flat` | `#1e4fd8` → `#d8341e` |
| Bút chì 2B | trắng | `flat` + `grain: graphite` | `#3b4a6b` → `#7a3b2e` |
| Bút dạ | xanh lá | `twotone` | `#2563eb`/`#1b47b8` → `#f97316`/`#c2410c` |
| Sáp màu | xanh lá | `flat` + `grain: wax` | `#2e9e5b` (chấm `#1f7a45`) → `#d9532b` (chấm `#a33a1c`) |
| Bút mực tím | xanh lam | `gradient` + `taper` | `#4a2d9c`→`#8f6ad6` · `#9c1f6e`→`#e26bb4` |
| Phấn màu | xanh lam | `gradient` + `dash` + `halo` | `#3b82c4`→`#a9cdf2` · `#d1467a`→`#f4b6cc` |
| Bút neon | tím | `neon` | `#00bcd4` (glow `#7cf5c5`) → `#ff2bd6` (glow `#ffa6ec`) |
| Bút lông | tím | `brush` | `#152a66`→`#4a6bd1` · `#8f0f1e`→`#e05a5a` |
| Bút lửa | vàng | `fire` | `#1e90ff`→`#9ff3ff` · `#e8401c`→`#ffd166` |
| Bút cầu vồng | vàng | `rainbow` | `[#2ecc71, #2d9cdb, #7b4fe0]` → `[#e0313b, #ff8c1a, #ffd93d]` |
| Bút vàng | vàng | `metal` | `[#b8860b, #ffe680, #fff6c2, #d4a017]` → `[#8c3b1e, #ffb27a, #ffd9bf, #c8653a]` |

`combo.style` ∈ `sticker` (vàng viền đen, mặc định) · `ink` (màu bút, viền giấy, xoay mạnh) · `chalk` (màu bút, không viền) · `neon` (màu `glow`, viền màu bút) · `sparkle` (màu `glow` — cầu vồng: màu giữa dải — + thêm chùm sao) · `fire` (màu `color2`, viền màu bút, thêm chùm lửa). `combo.particles` và `box.particles` ∈ `paper` (vụn giấy, có trọng lực) · `ink` (giọt mực) · `chalk` (bụi trắng, rơi chậm) · `spark` (tia, không rơi) · `star` (sao vàng). `sfx.capture`/`sfx.combo` là tên trong audio sprite; tên lạ → engine dùng `capture`/`combo` mặc định.

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
| Hover/chạm gần cạnh | Cạnh hiện mờ bằng chính bút của mình (hình thái `mine`) |
| Vẽ cạnh | Nét chạy từ chấm đầu đến chấm cuối (180 ms) theo tham số bút |
| Ăn ô | `box.effect` + vụn theo `box.particles`; `stamp`/`seal` đóng từ to xuống, còn lại nảy từ nhỏ lên |
| Ăn chuỗi | Chữ "COMBO ×n" theo `combo.style` của **bút người vừa đi**, vụn theo `combo.particles`, rung bàn từ `combo.shakeFrom` |
| Lượt chuyển | Thanh timer đổi bên |
| Kết thúc | Đếm ô từng người (ô nảy lần lượt + số to giữa bàn, tiếng "pop" cao dần), xong mới hiện kết quả |

Thiết bị bật "Giảm hiệu ứng" (`prefers-reduced-motion`) → tắt particle, rung, chữ nổ, bỏ qua đếm ô và mọi hiệu ứng chạy liên tục của bút (quầng thở, lửa, cầu vồng trôi, ánh kim).

## Âm thanh

- **Audio sprite** (một file `core.webm` + `core.mp3` dự phòng) qua Howler; `web/scripts/build-audio.mjs` gộp `shared/audio/core/*` + `shared/audio/ui/*`, chạy trước `dev`/`build`. Mọi tiếng trong game tổng hợp bởi `scripts/synth-sfx.mjs` (tất định, có seed); nguồn ngoài ghi ở [credits.md](credits.md).
- **Bộ tiếng theo bút:** `capture` (ting mặc định), `capture_soft` (chì/sáp), `capture_marker` (dạ), `capture_ink` (mực "ục"), `capture_chalk` (gõ phấn), `capture_neon` (blip sóng vuông), `capture_bell` (chuông), `capture_fire` (whoosh lửa); `combo` (lấp lánh mặc định), `combo_ink`, `combo_chalk`, `combo_neon`, `combo_bell`, `combo_fire` (bùng lửa + rumble + lách tách).
- **Combo:** ô thứ `n` trong một lượt phát `capture` của bút với `rate = 1 + 0.08 × (n−1)` (tối đa 1.6); từ ô thứ 2 phát thêm `combo` (`rate = 1 + 0.06 × (n−2)`, tối đa 1.5). Hai tiếng là của **bút người vừa đi** (`use-game-sounds.ts` đọc `SeatSkins`).
- Rung (`navigator.vibrate`) 15 ms khi ăn ô, mẫu `[15, 30, 25]` từ combo ×3.

## Shop & trang bị

- `/shop`: tab **Bút** / **Ô đã ăn**, lưới 2 cột trên điện thoại (3–4 trên desktop), ví ở đầu trang; thẻ = xem trước SVG tĩnh (bút: hai hình thái cạnh nhau "Mình" / "Đối thủ") + tên + bậc (màu) + giá; **Thử** mở bàn mẫu 3×3 thật (BoardCanvas) với skin gắn vào cả hai ghế, nút "Vẽ thử" đi từng nước theo kịch bản hai ghế thay nhau ăn ô (ghế 0 ăn chuỗi 2 ô cuối) để thấy cả hai hình thái, nghe tiếng và thấy COMBO; **Mua** (hộp xác nhận) → **Trang bị** → "Đang dùng". Khách xem/thử được, mua/trang bị mời đăng nhập Google.
- API: `GET /skins` (catalog), `GET /me/skins` (sở hữu, loadout, ví, `canBuy`), `POST /me/skins/{id}/buy`, `PUT /me/loadout` `{pen?, box?}`; `/me` có `loadout`. Lỗi: `UNKNOWN_ITEM`, `ALREADY_OWNED`, `NOT_OWNED`, `INSUFFICIENT_FUNDS`.
- Lối vào: nút giỏ hàng ở trang chủ (hàng nút tròn) và trong hộp thoại hồ sơ. Smoke: `pnpm smoke:shop`.

## Quy trình thêm skin

1. Viết manifest `shared/skins/<type>/<id>.json` (chọn hiệu ứng/tham số có sẵn; cần tiếng mới thì thêm generator vào `web/scripts/synth-sfx.mjs` rồi `node scripts/synth-sfx.mjs` + `pnpm assets:audio`).
2. `pnpm gen:skins` → hai bản sinh; test `api/tests/test_skins.py` và `web` (typecheck) phải xanh.
3. Xem trên `/shop` → Thử. Không cần seed DB hay upload asset.

Chưa làm (giữ ở lộ trình): skin `board` (bàn đấu), rương/bộ sưu tập (ADR-0007), tủ trưng bày, skin `reward` theo mùa/sự kiện.
