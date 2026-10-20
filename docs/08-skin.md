# 08 — Hệ thống skin

## Bốn loại skin

| Loại | Ảnh hưởng | Ví dụ |
|---|---|---|
| `pen` — Bút | Con trỏ/đầu bút khi vẽ, âm thanh vẽ | Bút bi xanh, bút chì 2B, bút mực tím, phấn trắng, bút dạ neon |
| `stroke` — Nét vẽ | Texture, độ run tay, animation chạy nét | Nét thường, nét run tay, mực loang, nét lấp lánh |
| `box` — Ô đã ăn | Hiệu ứng và hình khi chiếm ô | Gạch chéo, tô màu, dấu "10", chữ ký cô giáo, sticker |
| `board` — Bàn đấu | Nền, lưới, chấm, âm thanh nền | Vở ô li 4 ly, giấy caro, bảng đen, giấy kiểm tra |

Mỗi người chơi trang bị một skin mỗi loại (`loadouts`). Trong trận, **mỗi bên thấy skin bút/nét/ô của chính đối thủ** (được gửi trong `room_state.loadouts`); **bàn đấu** là bàn của người xem.

## Manifest

Skin được mô tả bằng dữ liệu, không bằng code. File nguồn ở `shared/skins/<type>/<id>.json`, được seed vào `items.manifest`. Asset nằm trên CDN theo `assetBase`.

```json
{
  "id": "pen_ink_purple",
  "type": "pen",
  "name": { "vi": "Bút mực tím", "en": "Purple Ink Pen" },
  "rarity": "rare",
  "price": 450,
  "assetBase": "skins/pen_ink_purple/",
  "pen":    { "sprite": "nib.png", "tipOffset": [4, 28] },
  "sfx":    { "draw": "scribble_ink" },
  "colors": { "light": "#5b3fa8", "dark": "#b9a4ff" }
}
```

```json
{
  "id": "stroke_shaky",
  "type": "stroke",
  "name": { "vi": "Nét run tay", "en": "Shaky Hand" },
  "rarity": "common",
  "price": 150,
  "stroke": { "texture": "pencil.png", "width": 3, "jitter": 0.6, "drawMs": 180, "ease": "power2.out" }
}
```

```json
{
  "id": "box_stamp_10",
  "type": "box",
  "name": { "vi": "Dấu 10 điểm", "en": "Perfect 10 Stamp" },
  "rarity": "epic",
  "price": 1200,
  "box": { "effect": "stamp", "sprite": "stamp10.png", "durationMs": 350, "particles": "paper" },
  "sfx": { "capture": "stamp_thud" }
}
```

```json
{
  "id": "board_blackboard",
  "type": "board",
  "name": { "vi": "Bảng đen", "en": "Blackboard" },
  "rarity": "rare",
  "price": 450,
  "board": { "background": "blackboard.jpg", "gridColor": "#ffffff22", "dotSprite": "chalk_dot.png" },
  "sfx": { "ambient": "classroom_ambient" }
}
```

Trường `name` (và `description` nếu có) luôn có đủ `vi` và `en` — script seed từ chối manifest thiếu ngôn ngữ.

Hiệu ứng (`effect`) là một danh sách cố định được code sẵn trong engine (`hatch`, `fill`, `stamp`, `sticker`, `signature`…). Skin chỉ chọn hiệu ứng và tham số, nên thêm skin mới **không cần sửa code**.

## Animation trong trận

| Sự kiện | Hiệu ứng |
|---|---|
| Hover/chạm gần cạnh | Cạnh hiện mờ, đầu bút đi theo |
| Vẽ cạnh | Nét chạy từ chấm đầu đến chấm cuối trong `drawMs` |
| Ăn ô | Hiệu ứng `box.effect` + particle, ô nảy nhẹ |
| Ăn chuỗi | Chữ "COMBO ×n", rung màn hình nhẹ từ ×3 |
| Lượt chuyển | Thanh timer đổi bên, ảnh đại diện sáng lên |
| Kết thúc | Đếm ô từng ô, dấu "THẮNG"/"THUA" đóng xuống |

Thiết bị yếu hoặc người chơi bật "Giảm hiệu ứng" (và `prefers-reduced-motion`) → tắt particle và rung.

## Âm thanh

- Dùng **audio sprite** (một file `.webm` + `.mp3` dự phòng) qua Howler để giảm số request và độ trễ trên iOS.
- Âm thanh mặc định: `draw_default`, `capture_ting`, `turn_change`, `school_drum` (vào trận), `win`, `lose`.
- **Combo:** khi ăn ô thứ `n` trong một lượt, phát `capture` với `rate = 1 + 0.08 × (n-1)` (tối đa 1.6) → cao độ tăng dần.
- Rung (`navigator.vibrate`) 15 ms khi ăn ô, trên thiết bị hỗ trợ.
- Âm lượng nhạc / hiệu ứng tách riêng, lưu ở `localStorage`.

## Quy trình thêm skin

1. Làm asset theo [12 — Asset](12-asset.md) (ưu tiên thủ tục/SVG) → đặt vào `shared/skins/<type>/<id>/`.
2. Viết manifest `shared/skins/<type>/<id>.json`.
3. `pnpm assets:build` → kiểm tra manifest, đóng gói atlas/audio sprite, xuất ra `web/public/assets/`.
4. Chạy script seed → upsert vào `items`, upload asset lên R2.
5. Kiểm tra trên trang `/dev/skins` (chỉ môi trường dev): xem trước mọi skin trên bàn mẫu.
