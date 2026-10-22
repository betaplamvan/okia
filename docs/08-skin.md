# 08 — Hệ thống skin

Quyết định: [ADR-0013](adr/0013-skin-but-o-nam-bac-hiem.md) (2026-10-21; bổ sung cùng ngày: bút hai hình thái), [ADR-0014](adr/0014-goi-skin-zip-asset-ngoai.md) (2026-10-22: gói skin zip có ảnh + tiếng, nhập ở admin). **Đã làm:** catalog 22 skin, engine, shop `/shop`, mua/trang bị, loadout trong trận, gói skin. Code: `shared/skins/` (manifest, `schema.json`, `SPEC.md`, gói mẫu `_template/`), `web/src/game/skins/`, `web/src/game/renderer/board-renderer.ts` (hiệu ứng), `api/app/skins/` (catalog, gói `package.py`, kho, shop).

## Hai loại skin

| Loại            | Ảnh hưởng                                                                                                                                                                                                                    | Skin hiện có                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pen` — Bút     | **Một gói trọn:** nét vẽ (kiểu nét `style` + hai hình thái màu, bề dày, mờ, run tay, đầu nét, nét đứt, thanh đậm, hạt), **bộ tiếng ăn ô / combo riêng**, **kiểu chữ COMBO**, **loại vụn** bắn ra, mốc combo bắt đầu rung bàn | Bút bi (default), Bút chì 2B, Bút dạ, Sáp màu, Bút mực tím, Phấn màu, Bút neon, Bút lông, Bút lửa, Bút cầu vồng, Bút vàng           |
| `box` — Ô đã ăn | Hình tô vào ô khi chiếm (màu = hình thái bút của người ăn) + animation hiện + hiệu ứng sống + loại vụn                                                                                                                       | Gạch chéo (default), Tô kín, Gạch ca-rô, Chấm bi, Nguệch ngoạc, Ngôi sao, Dấu 10 điểm, Trái tim, Dấu sáp vàng, Hoa điểm tốt, Ô cháy |

Mỗi người chơi trang bị một skin mỗi loại (`loadouts`). Trong trận, **mỗi bên thấy bút/ô của chính người vẽ** (gửi trong `room_state.loadouts`, key = user id); chơi với máy thì máy dùng skin mặc định.

**Hai hình thái của bút.** Mỗi bút có hai bộ màu: `mine` (tông **lạnh**) và `opponent` (tông **nóng**). Engine áp hình thái theo _phía nhìn_: ghế bằng `session.human` dùng `mine`, ghế kia dùng `opponent` — nên **cả hai người đều thấy nét của mình lạnh, nét đối thủ nóng**, vẫn phân biệt được hai bên dù cùng bút. Màu nét, màu tô ô đã ăn (skin ô giữ hiệu ứng, lấy màu từ hình thái bút của người ăn), chữ COMBO, quầng sáng, vụn đều theo hình thái; bề dày / run tay / nét đứt / thanh đậm / tiếng dùng chung. Nét xem trước (hover) dùng hình thái `mine`. `colors.pens` của renderer chỉ còn là dự phòng.

## Năm bậc hiếm

| `rarity`    | Màu                    | Giá                              | Ví dụ                                                               |
| ----------- | ---------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `common`    | **Trắng** `#fffcf2`    | 100 Ruột chì (default: miễn phí) | Bút chì 2B, Tô kín                                                  |
| `uncommon`  | **Xanh lá** `#7cf5c5`  | 250 Ruột chì                     | Bút dạ, Sáp màu, Gạch ca-rô, Chấm bi                                |
| `rare`      | **Xanh lam** `#8ec5ff` | 600 Ruột chì                     | Bút mực tím, Phấn màu, Nguệch ngoạc, Ngôi sao                       |
| `epic`      | **Tím** `#c9a7ff`      | 1 500 Ruột chì                   | Bút neon, Bút lông, Dấu 10 điểm, Trái tim                           |
| `legendary` | **Vàng** `#ffd93d`     | **5 Hoa điểm tốt**               | Bút lửa, Bút cầu vồng, Bút vàng, Dấu sáp vàng, Hoa điểm tốt, Ô cháy |

Giá cố định trong `api/app/skins/catalog.py` (`RARITY_PRICE`) và `web/src/game/skins/skins.ts`; manifest không ghi giá. Thẻ trong shop viền và bóng theo màu bậc.

## Manifest

Nguồn sự thật về cấu trúc: **`shared/skins/schema.json`** (JSON Schema 2020-12; thêm trường mới thì sửa ở đây trước). Seed trong repo: `shared/skins/<type>/<id>.json`. `pnpm gen:skins` kiểm tra bằng ajv theo schema (+ ràng buộc ngoài schema: id khớp tên file và tiền tố theo loại, đúng một `default` mỗi loại bậc common, hai hình thái khác màu chính, `rainbow`/`metal` phải có `colors`, seed không tham chiếu file) rồi sinh `api/app/skins/catalog.json` + `web/src/game/skins/catalog.data.ts` và chép schema sang `api/app/skins/schema.json`. **Không sửa tay** các file sinh. Cùng bộ kiểm tra (`web/scripts/lib/skin-schema.mjs`) dùng cho `pnpm skin:validate`; API dùng `jsonschema` với cùng thông điệp.

```json
{
  "id": "pen_ink_purple",
  "type": "pen",
  "rarity": "rare",
  "name": { "vi": "Bút mực tím", "en": "Purple Ink Pen" },
  "description": {
    "vi": "Mực tím học trò; ăn ô là mực bắn tung tóe.",
    "en": "…"
  },
  "forms": {
    "mine": { "color": "#4a2d9c", "color2": "#8f6ad6" },
    "opponent": { "color": "#9c1f6e", "color2": "#e26bb4" }
  },
  "pen": {
    "style": "gradient",
    "width": 1.1,
    "alpha": 0.95,
    "jitter": 0.8,
    "taper": true
  },
  "combo": { "style": "ink", "particles": "ink", "shakeFrom": 3 },
  "sfx": { "capture": "capture_ink", "combo": "combo_ink" }
}
```

| Trường `forms.mine` / `forms.opponent` | Ý nghĩa                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `color`                                | màu chính (bắt buộc, hex) — nét, ô đã ăn, vụn                            |
| `color2`                               | màu cuối gradient (mực, phấn, lông, lửa)                                 |
| `colors`                               | mảng mốc màu nhiều điểm (cầu vồng, kim loại)                             |
| `glow`                                 | màu quầng sáng (neon, vàng); cũng là màu chữ COMBO kiểu `neon`/`sparkle` |
| `core`                                 | màu lõi sáng giữa nét (neon)                                             |
| `accent`                               | màu chấm sáp (sáp màu)                                                   |

| Trường `pen` | Ý nghĩa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`      | kiểu nét: `flat` (phẳng) · `twotone` (viền đậm `color2` rộng ×1.6 dưới lõi `color`) · `gradient` (`color` → `color2` dọc nét — PixiJS không có gradient cho stroke nên vẽ từng đoạn con) · `neon` (quầng `glow` ×2.6 **thở** 0.25–0.45 chu kỳ 1.2 s + lõi `core`) · `brush` (thanh đậm 0.4×→1.5× + gradient + halo mực loang `color2` nở ×1→×2.2 trong 0.6 s) · `fire` (lõi sáng + nét + **lửa liên tục** bay lên dọc nét, trần ~60 hạt/bàn, tốc độ sinh theo số cạnh; ăn ô là ô bùng cháy) · `rainbow` (gradient nhiều mốc `colors` **trôi** 2 s/chu kỳ, vẽ lại mỗi ~50 ms) · `metal` (gradient `colors` + quầng `glow` + **vệt ánh kim** chạy dọc nét mỗi ~3 s + sao lóe hiếm) |
| `width`      | hệ số bề dày so với nét mặc định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `alpha`      | độ mờ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `jitter`     | hệ số run tay (1 = mặc định; 2B/sáp > 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cap`        | `round` \| `square` (bút dạ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `taper`      | thanh đậm: mảnh hai đầu, dày giữa (mực)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `dash`       | `[vẽ, hở]` theo tỷ lệ ô — nét đứt (phấn)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `grain`      | `graphite` (vệt chì mảnh lệch bên, bút chì 2B) · `wax` (chấm sáp sẫm màu `accent`, sáp màu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `halo`       | quầng bụi `color2` rộng mờ dưới nét (phấn)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Hiệu ứng chạy liên tục (thở, lửa, trôi, ánh kim) đi qua `app.ticker` của renderer; bật "Giảm hiệu ứng" → tất cả **tĩnh**. Hiệu năng: quầng neon chỉ đổi alpha (không vẽ lại); mỗi cạnh animate vẽ lại tối đa một lần / ~50 ms; hạt lửa dùng pool Graphics (chỉ đổi vị trí / scale / tint), trần 60 hạt.

Các bút / ô dưới đây là bộ ban đầu (nay nằm ngoài repo, nhập qua admin — xem "Seed chỉ còn skin default"):

| Bút          | Bậc      | `style`                      | `mine` → `opponent`                                                             |
| ------------ | -------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Bút bi       | trắng    | `flat`                       | `#1e4fd8` → `#d8341e`                                                           |
| Bút chì 2B   | trắng    | `flat` + `grain: graphite`   | `#3b4a6b` → `#7a3b2e`                                                           |
| Bút dạ       | xanh lá  | `twotone`                    | `#2563eb`/`#1b47b8` → `#f97316`/`#c2410c`                                       |
| Sáp màu      | xanh lá  | `flat` + `grain: wax`        | `#2e9e5b` (chấm `#1f7a45`) → `#d9532b` (chấm `#a33a1c`)                         |
| Bút mực tím  | xanh lam | `gradient` + `taper`         | `#4a2d9c`→`#8f6ad6` · `#9c1f6e`→`#e26bb4`                                       |
| Phấn màu     | xanh lam | `gradient` + `dash` + `halo` | `#3b82c4`→`#a9cdf2` · `#d1467a`→`#f4b6cc`                                       |
| Bút neon     | tím      | `neon`                       | `#00bcd4` (glow `#7cf5c5`) → `#ff2bd6` (glow `#ffa6ec`)                         |
| Bút lông     | tím      | `brush`                      | `#152a66`→`#4a6bd1` · `#8f0f1e`→`#e05a5a`                                       |
| Bút lửa      | vàng     | `fire`                       | `#1e90ff`→`#9ff3ff` · `#e8401c`→`#ffd166`                                       |
| Bút cầu vồng | vàng     | `rainbow`                    | `[#2ecc71, #2d9cdb, #7b4fe0]` → `[#e0313b, #ff8c1a, #ffd93d]`                   |
| Bút vàng     | vàng     | `metal`                      | `[#b8860b, #ffe680, #fff6c2, #d4a017]` → `[#8c3b1e, #ffb27a, #ffd9bf, #c8653a]` |

`combo.style` ∈ `sticker` (vàng viền đen, mặc định) · `ink` (màu bút, viền giấy, xoay mạnh) · `chalk` (màu bút, không viền) · `neon` (màu `glow`, viền màu bút) · `sparkle` (màu `glow` — cầu vồng: màu giữa dải — + thêm chùm sao) · `fire` (màu `color2`, viền màu bút, thêm chùm lửa). `combo.particles` và `box.particles` ∈ `paper` (vụn giấy, có trọng lực) · `ink` (giọt mực) · `chalk` (bụi trắng, rơi chậm) · `spark` (tia, không rơi) · `star` (sao vàng) · `heart` (tim nhỏ) · `image` (ảnh `particleImage` trong gói, nhuộm màu bút). `sfx.capture`/`sfx.combo` là tên trong audio sprite **hoặc** file trong gói (`sfx/<tên>.webm`); tên lạ / file lỗi → engine dùng `capture`/`combo` mặc định. `pen.texture` (ảnh lặp trong gói) là lớp phủ trên nét: vùng đục nhuộm `color2` của hình thái, vùng trong suốt để lộ màu nét; `textureScale` chỉnh cỡ.

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

Skin ô chỉ định **hình** và **animation hiện** (+ hiệu ứng sống, + loại vụn); màu luôn là màu hình thái bút của người ăn. Hình ≤ ~80 % ô để đếm ô cuối ván vẫn đọc được. Danh sách cố định trong engine (`buildBox` → mỗi hiệu ứng một builder trả về `{ animate, live? }`); thêm skin mới chỉ cần chọn hiệu ứng và tham số. Bật "Giảm hiệu ứng" → hình hiện ngay, không có hiệu ứng sống.

| `box.effect`                       | Hình                                                                                                                            | Animation hiện                                                                                                      | Hiệu ứng sống (ticker)                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `hatch` — Gạch chéo                | nền tô nhạt + 3 nét gạch chéo                                                                                                   | nền hiện trước, 3 nét vẽ lần lượt (0,25 s)                                                                          | —                                                                                                                       |
| `fill` — Tô kín                    | tứ giác hơi lệch (không phải hình chữ nhật hoàn hảo) alpha 0,4 + 2–3 vệt tô lòi ra mép                                          | màu quét từ góc trên trái sang như nhát bút rộng (0,3 s, mask)                                                      | —                                                                                                                       |
| `crosshatch` — Gạch ca-rô          | nền + gạch xuôi + gạch ngược                                                                                                    | gạch xuôi vẽ trước, gạch ngược sau (0,35 s), nền đậm dần theo                                                       | —                                                                                                                       |
| `dots` — Chấm bi                   | 3×3 chấm, chấm giữa to; ô < 44 px → 2×2 chấm to                                                                                 | chấm nảy lên lần lượt theo xoắn ốc từ giữa ra (40 ms/chấm)                                                          | —                                                                                                                       |
| `scribble` — Nguệch ngoạc          | zigzag tất định theo id ô, nét dày, alpha 0,6                                                                                   | nét vẽ dần theo đường (0,4 s) có chấm "đầu bút" đi trước; xong thì ô rung 2 px                                      | —                                                                                                                       |
| `star` — Ngôi sao                  | sao ~80 % ô, tô alpha 0,6 + viền                                                                                                | rơi từ trên xuống (y −0,6 ô, scale 0,5→1,1→1, 0,35 s); chạm đất lóe 4 tia vàng ở 4 góc                              | —                                                                                                                       |
| `stamp` — Dấu 10 điểm              | vòng ngoài đứt quãng (tất định) + vòng trong + chữ "10", nghiêng ±8° theo id ô                                                  | đập từ to xuống (1,6×→1×, 0,22 s, power3.in); mực lan quanh viền (đĩa mờ alpha 0→0,12, 1→1,15, 0,3 s); rung bàn nhẹ | —                                                                                                                       |
| `heart` — Trái tim                 | tim tô + viền, vệt sáng giấy ở góc trên trái                                                                                    | đập hai nhịp (1→1,2→1→1,15→1, 0,45 s), 3 tim nhỏ bay lên tan dần; vụn `heart`                                       | —                                                                                                                       |
| `seal` — Dấu sáp vàng              | đĩa sáp vàng méo (tất định) viền mực + sao màu bút                                                                              | giọt sáp rơi rồi lan thành đĩa (0,25 s), con dấu đập xuống in sao (0,2 s), chùm sao                                 | vệt lấp lánh chạy qua mặt sáp mỗi ~3 s (lệch pha theo ô), 0 hạt                                                         |
| `flower` — Hoa điểm tốt            | 5 cánh (ellipse) màu bút alpha 0,7 + viền, nhụy vàng viền mực                                                                   | từng cánh nở quanh nhụy (80 ms/cánh, 0,4 s), phấn hoa vàng bay lên                                                  | cả hoa khẽ lay (±3°, 2 s/chu kỳ)                                                                                        |
| `flame` — Ô cháy                   | nền cháy xém alpha 0,28 mép lượn sóng + viền mực alpha 0,5                                                                      | bùng ~8 ngọn lửa màu bút/`color2` (dùng chung hạt lửa của Bút lửa, 0,3 s) rồi nền hiện                              | 2 đốm than hồng nhấp nháy + 1 làn khói mỏng bay lên, liên tục; tối đa 3 vật thể/ô, trần 150 cả bàn (bàn 7×7 đầy vẫn đủ) |
| `image` — Ảnh trong gói (ADR-0014) | ảnh `box.image` (SVG/PNG/WebP) vừa `scale` × ô (mặc định 0,9), nhuộm màu bút trừ khi `tint: false`, nghiêng ±6° tất định theo ô | đập từ to xuống (1,5×→1×, 0,28 s, back.out); chưa nạp ảnh → gạch chéo, vẽ lại khi nạp xong                          | —                                                                                                                       |

Vụn (`box.particles`) bắn ra lúc ăn ô dùng màu hình thái bút của người ăn.

## Animation trong trận

| Sự kiện             | Hiệu ứng                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Hover/chạm gần cạnh | Cạnh hiện mờ bằng chính bút của mình (hình thái `mine`)                                                               |
| Vẽ cạnh             | Nét chạy từ chấm đầu đến chấm cuối (180 ms) theo tham số bút                                                          |
| Ăn ô                | hình `box.effect` với animation hiện riêng (bảng trên) + vụn theo `box.particles`; Bút lửa ăn ô → thêm chùm lửa       |
| Ăn chuỗi            | Chữ "COMBO ×n" theo `combo.style` của **bút người vừa đi**, vụn theo `combo.particles`, rung bàn từ `combo.shakeFrom` |
| Lượt chuyển         | Thanh timer đổi bên                                                                                                   |
| Kết thúc            | Đếm ô từng người (ô nảy lần lượt + số to giữa bàn, tiếng "pop" cao dần), xong mới hiện kết quả                        |

Thiết bị bật "Giảm hiệu ứng" (`prefers-reduced-motion`) → tắt particle, rung, chữ nổ, bỏ qua đếm ô, animation hiện của ô (hình hiện ngay) và mọi hiệu ứng chạy liên tục của bút / ô (quầng thở, lửa, cầu vồng trôi, ánh kim, sáp lấp lánh, hoa lay, than hồng).

## Âm thanh

- **Audio sprite** (một file `core.webm` + `core.mp3` dự phòng) qua Howler; URL kèm `?v=<băm sprite>` (`src/game/audio/sprite-version.json` do build-audio ghi, commit) để thêm tiếng mới không dính cache CDN / trình duyệt (header `/assets` cache 1 giờ + CDN 1 ngày); `web/scripts/build-audio.mjs` gộp `shared/audio/core/*` + `shared/audio/ui/*`, chạy trước `dev`/`build`. Mọi tiếng trong game tổng hợp bởi `scripts/synth-sfx.mjs` (tất định, có seed); nguồn ngoài ghi ở [credits.md](credits.md).
- **Ghép được trận** (docs/07): `match_found` — "ready check" tổng hợp (đệm trầm dâng + chuông C5-E5-G5), 1,4 s; 5 giây cuối hộp chấp nhận gõ `count` mỗi giây.
- **Bộ tiếng theo bút:** `capture` (ting mặc định), `capture_soft` (chì/sáp), `capture_marker` (dạ), `capture_ink` (mực "ục"), `capture_chalk` (gõ phấn), `capture_neon` (blip sóng vuông), `capture_bell` (chuông), `capture_fire` (whoosh lửa); `combo` (lấp lánh mặc định), `combo_ink`, `combo_chalk`, `combo_neon`, `combo_bell`, `combo_fire` (bùng lửa + rumble + lách tách).
- **Combo:** ô thứ `n` trong một lượt phát `capture` của bút với `rate = 1 + 0.08 × (n−1)` (tối đa 1.6); từ ô thứ 2 phát thêm `combo` (`rate = 1 + 0.06 × (n−2)`, tối đa 1.5). Hai tiếng là của **bút người vừa đi** (`use-game-sounds.ts` đọc `SeatSkins`).
- Rung (`navigator.vibrate`) 15 ms khi ăn ô, mẫu `[15, 30, 25]` từ combo ×3.
- **Tiếng bấm chung** (`web/src/game/audio/ui-sounds.ts`, 2026-10-21): một listener `click` (capture) trên `document` do `AudioProvider` gắn, bắt mọi nút / link / tab / công tắc / ô chọn và phát `ui_click` — không gắn tay từng nút. Đổi tiếng bằng `data-sfx` trên phần tử hoặc tổ tiên: `confirm` (hành động chính: Chơi luôn!, Tạo phòng, Mua, Trang bị, Ván mới…), `back` (Hủy / Từ chối), `open` (Thử skin), `close`, `none` (im). Nút vô hiệu không kêu; hai click cách < 40 ms chỉ kêu một. Code chỉ còn gọi `audio.playUi` cho sự kiện không phải click (WS `matched` → confirm, `match_cancelled` → back, lỗi API → error, bật lại SFX → confirm).

## Catalog trong DB (2026-10-22)

Nguồn lúc chạy là bảng `skins` (id, type, rarity, enabled, sort, manifest JSONB). `app/skins/catalog.json` (sinh từ `shared/skins` bằng `pnpm gen:skins`) chỉ còn là **seed**: API khởi động chèn các id chưa có trong DB, không ghi đè bản admin đã sửa. Mỗi tiến trình giữ cache, đọc lại DB mỗi 15 giây (admin sửa thì tiến trình đó cập nhật ngay). Web tải `GET /skins` lúc boot và `registerSkins()` thay bảng tra của engine (bản biên dịch `catalog.data.ts` là dự phòng) — thêm / sửa / tắt skin ở `/admin` không cần deploy. Skin `default` không xóa / tắt / ghi đè bằng bản không-default được; xóa skin khác thì người sở hữu về mặc định. API kiểm tra manifest theo `schema.json` (cùng quy tắc với `gen-skins.mjs`). Giá theo bậc lấy từ thông số admin `rarity_price`.

## Seed chỉ còn skin default (2026-10-22)

`shared/skins/{pen,box}/` chỉ giữ **hai skin default** (seed bắt buộc để catalog luôn có mặc định). 20 skin còn lại (bảng trên) không còn trong repo: chúng là **tài nguyên** nhập qua admin như mọi gói khác — bản sao lưu ở `shared/skins/_backup/` trên máy dev (gitignore; bundle `okia-skins-backup-<ngày>.zip` nhập lại một phát với tùy chọn "thay toàn bộ catalog"). Test / smoke dùng 6 skin trong `shared/fixtures/skins/test-skins.json` (nhập qua `POST /admin/skins/import` lúc chạy). Admin có nút **"Xóa tất cả trừ mặc định"** (`POST /admin/skins/purge`): xóa mọi skin không-default kể cả đang tắt và file đi kèm; dòng sở hữu trong `inventory` giữ nguyên nên nhập lại cùng id là người chơi có lại ngay.

## Gói skin `.okiaskin.zip` (2026-10-22, ADR-0014)

**Chuẩn:** [`shared/skins/SPEC.md`](../shared/skins/SPEC.md) (viết cho người và agent sinh skin) + `schema.json`; gói mẫu `shared/skins/_template/{pen_example,box_example}`. Gói = `skin.json` + file tùy chọn trong bốn thư mục `sfx/` (webm/mp3/ogg ≤ 400 KB), `box/`, `particles/`, `pen/` (svg/png/webp ≤ 300 KB); tối đa 24 file, zip ≤ 3 MB; mọi file phải được manifest tham chiếu và ngược lại. Một zip có thể là **bundle** nhiều thư mục (mỗi thư mục một gói). Ba primitive nhận ảnh trong engine: `box.effect: image`, `particles: image`, `pen.texture`; tiếng: `sfx.*` trỏ file trong gói. Không có code trong gói.

**Luồng nhập** (`POST /admin/skins/import-package`, multipart): giải nén an toàn (`app/skins/package.py`: chặn `..`, kiểm tra chữ ký PNG/WebP/WebM/MP3/Ogg/SVG, SVG không script / không tham chiếu ngoài) → kiểm tra manifest theo schema + ràng buộc → kiểm tra **hết** bundle rồi mới ghi: file lên object storage (`skins/{id}/{ver}/{path}`, `ver` = băm nội dung 10 hex), manifest vào DB kèm `assets {ver, files}`, `catalog.sync_from_db`; phiên bản cũ của cùng id được dọn sau khi commit. Client nhận `/skins` với `assets.base` (= `API_BASE_URL/skins/assets/{id}/{ver}`) và tự ghép URL (`assetUrl()` trong `skins.ts`); `GET /skins/assets/{id}/{ver}/{path}` trả file với `Cache-Control: immutable`, `nosniff`, SVG kèm CSP `default-src 'none'`.

**Client:** renderer nạp ảnh qua `Assets.load` khi `setSkins` (`loadAssets`), vẽ lại khi xong; trước đó ô ảnh hiện gạch chéo, nét không texture, vụn ảnh thành vụn giấy. Tiếng ngoài sprite: `audio.loadSfx(url)` nạp trước khi vào trận (`use-game-sounds.ts`), lỗi tải → tiếng mặc định. Thẻ shop (`SkinPreview`) vẽ ảnh ô qua mask SVG (nhuộm màu).

**Xuất:** `GET /admin/skins/{id}/package` → zip đúng chuẩn (sửa rồi nhập lại); `GET /admin/skins/export` → bundle mọi skin (`?format=json` chỉ manifest, không file). Trang admin tab Skin: nút "Nhập gói" (.zip / .json) hoặc kéo thả → **hộp xem trước** trước khi ghi (`POST /admin/skins/preview-package` kiểm tra y như nhập nhưng không ghi; thẻ đúng như trong shop, file đi kèm với cỡ, nhãn Mới / Đã có — sẽ ghi đè / Mặc định; nút Thử mở bàn mẫu thật với ảnh / tiếng đọc ngay từ zip qua blob: URL — `assets.urls` chỉ ở client) rồi mới "Nhập"; nhãn "gói · n file" trên thẻ; hộp sửa metadata có **thẻ xem trước sống** đổi theo tên / mô tả / bậc đang gõ, liệt kê file. CLI: `pnpm skin:pack <thư mục>` / `pnpm skin:validate <thư mục | zip>` (web/scripts/skin-pack.mjs, cùng bộ kiểm tra và thông điệp lỗi với API).

## Shop & trang bị

- `/shop`: tab **Bút** / **Ô đã ăn**, lưới 2 cột trên điện thoại (3–4 trên desktop), ví ở đầu trang; thẻ = xem trước SVG tĩnh (bút: hai hình thái cạnh nhau "Mình" / "Đối thủ") + tên + bậc (màu) + giá; **Thử** mở bàn mẫu 3×3 thật (BoardCanvas) với skin gắn vào cả hai ghế, nút "Vẽ thử" đi từng nước theo kịch bản hai ghế thay nhau ăn ô (ghế 0 ăn chuỗi 2 ô cuối) để thấy cả hai hình thái, nghe tiếng và thấy COMBO; **Mua** (hộp xác nhận) → **Trang bị** → "Đang dùng". Khách xem/thử được, mua/trang bị mời đăng nhập Google.
- API: `GET /skins` (catalog), `GET /me/skins` (sở hữu, loadout, ví, `canBuy`), `POST /me/skins/{id}/buy`, `PUT /me/loadout` `{pen?, box?}`; `/me` có `loadout`. Lỗi: `UNKNOWN_ITEM`, `ALREADY_OWNED`, `NOT_OWNED`, `INSUFFICIENT_FUNDS`.
- Lối vào: nút giỏ hàng ở trang chủ (hàng nút tròn) và trong hộp thoại hồ sơ. Smoke: `pnpm smoke:shop`.

## Quy trình thêm skin

1. Viết manifest `shared/skins/<type>/<id>.json` (chọn hiệu ứng/tham số có sẵn; cần tiếng mới thì thêm generator vào `web/scripts/synth-sfx.mjs` rồi `node scripts/synth-sfx.mjs` + `pnpm assets:audio`).
2. `pnpm gen:skins` → hai bản sinh; test `api/tests/test_skins.py` và `web` (typecheck) phải xanh.
3. Xem trên `/shop` → Thử. Không cần seed DB hay upload asset.

Chưa làm (giữ ở lộ trình): skin `board` (bàn đấu), rương/bộ sưu tập (ADR-0007), tủ trưng bày, skin `reward` theo mùa/sự kiện.
