# Gói skin Ô Kìa — đặc tả v1

Tài liệu này viết cho **người và công cụ sinh skin** (agent, script). Mục tiêu: tạo một file
`<id>.okiaskin.zip` đúng chuẩn, admin kéo thả vào trang `/admin` → skin xuất hiện trong shop,
không cần deploy. Nguồn sự thật về cấu trúc `skin.json` là [`schema.json`](schema.json)
(JSON Schema 2020-12); SPEC chỉ giải thích ý nghĩa và các ràng buộc ngoài schema.

## 1. Cấu trúc gói

```
pen_example.okiaskin.zip
├── skin.json              bắt buộc — manifest (schema.json)
├── sfx/capture.webm       tùy chọn — tiếng ăn ô        (webm/opus, mp3, ogg; ≤ 400 KB)
├── sfx/combo.webm         tùy chọn — tiếng COMBO
├── particles/shape.svg    tùy chọn — hình vụn           (svg, png, webp; ≤ 300 KB)
├── pen/texture.png        tùy chọn — ảnh lặp phủ lên nét (png, webp, svg; ≤ 300 KB)
├── box/stamp.svg          tùy chọn — hình tô vào ô      (svg, png, webp; ≤ 300 KB) — chỉ skin box
├── preview.png            tùy chọn — bỏ qua khi nhập
└── README.md / LICENSE    tùy chọn — bỏ qua khi nhập
```

- `skin.json` nằm ở gốc zip **hoặc** trong đúng một thư mục con (zip cả thư mục cũng được).
- Một zip có thể chứa **nhiều skin**: mỗi thư mục con một `skin.json` (bundle — đây là định dạng
  "Xuất tất cả" của admin).
- Tên file: chỉ `a-z 0-9 _ -`, đúng thư mục theo loại (`sfx/`, `particles/`, `pen/`, `box/`).
  Mọi file asset trong gói **phải được tham chiếu** từ `skin.json`; tham chiếu tới file không
  có trong gói → từ chối. Tối đa 24 file, cả zip ≤ 3 MB.
- Máy chủ kiểm tra chữ ký file (PNG, WebP, Opus/WebM, MP3, Ogg, SVG). SVG không được chứa
  `<script>`, `on*=`, `javascript:`, `<foreignObject>`, `<!ENTITY`, tham chiếu ngoài.

## 2. `skin.json` tối thiểu

Bút (`pen`):

```json
{
  "schema": 1,
  "id": "pen_example",
  "type": "pen",
  "rarity": "rare",
  "name": { "vi": "Bút ví dụ", "en": "Example Pen" },
  "description": { "vi": "Mô tả ngắn, một câu.", "en": "One short sentence." },
  "forms": {
    "mine": { "color": "#2457c5", "color2": "#8fb8ff" },
    "opponent": { "color": "#c9372c", "color2": "#ffb199" }
  },
  "pen": { "style": "gradient", "width": 1.1, "alpha": 0.95, "jitter": 0.8, "texture": "pen/texture.png" },
  "combo": { "style": "sticker", "particles": "image", "particleImage": "particles/shape.svg", "shakeFrom": 3 },
  "sfx": { "capture": "sfx/capture.webm", "combo": "sfx/combo.webm" }
}
```

Dấu ăn ô (`box`):

```json
{
  "schema": 1,
  "id": "box_example",
  "type": "box",
  "rarity": "epic",
  "name": { "vi": "Dấu ví dụ", "en": "Example Stamp" },
  "description": { "vi": "Mô tả ngắn.", "en": "Short description." },
  "box": { "effect": "image", "image": "box/stamp.svg", "tint": true, "scale": 0.9, "alpha": 1, "particles": "image", "particleImage": "particles/shape.svg" }
}
```

## 3. Ý nghĩa các trường

| Trường | Ghi chú |
|---|---|
| `id` | `pen_…` / `box_…`, chữ thường, 5–48 ký tự. Trùng id đang có → **ghi đè** (người đang sở hữu giữ nguyên). |
| `rarity` | `common` 100 · `uncommon` 250 · `rare` 600 · `epic` 1500 Ruột chì · `legendary` 5 Hoa điểm tốt. Không ghi giá. |
| `name`, `description` | Cả `vi` và `en`, ≤ 160 ký tự. Mô tả một câu, nói hiệu ứng nhìn thấy. |
| `default` | Chỉ seed trong repo. Gói nhập từ ngoài **không** được `true`. |
| `forms.mine` / `forms.opponent` | Hai hình thái màu. `mine` tông **lạnh** (xanh/tím/lục), `opponent` tông **nóng** (đỏ/cam/hồng). Hai `color` phải khác nhau. Cả hai người chơi đều thấy nét của mình lạnh, nét đối thủ nóng. |
| `pen.style` | `flat` phẳng · `twotone` viền `color2` · `gradient` `color`→`color2` · `neon` quầng `glow` + lõi `core` · `brush` thanh đậm + mực loang `color2` · `fire` lửa bay · `rainbow` / `metal` nhiều mốc `colors` (bắt buộc). |
| `pen.texture` | Ảnh lặp phủ **lên** nét: vùng đục nhuộm `color2` của hình thái, vùng trong suốt để lộ màu nét (vẽ trắng trên nền trong suốt, 32–128 px, lặp được; `textureScale` chỉnh cỡ). |
| `combo.style` | Kiểu chữ COMBO: `sticker`, `ink`, `chalk`, `neon`, `sparkle`, `fire`. |
| `*.particles` | Vụn: `paper`, `ink`, `chalk`, `spark`, `star`, `heart`, hoặc `image` + `particleImage` (ảnh nhỏ, nhuộm theo màu bút; ≤ 64 px là đủ). |
| `sfx.capture` / `sfx.combo` | Tên tiếng có sẵn (xem schema `sfxRef`) hoặc file trong gói. Tiếng ngắn (< 1 s), mono, đã chuẩn hóa −1 dBFS; engine tự nâng cao độ theo combo. |
| `box.effect` | Hình có sẵn (`hatch`, `fill`, `crosshatch`, `dots`, `scribble`, `star`, `stamp`, `heart`, `seal`, `flower`, `flame`) hoặc `image` + `box.image`. |
| `box.image` | Ảnh vuông, nền trong suốt, 128–256 px (SVG tốt nhất). `tint: true` (mặc định) nhuộm theo màu bút người ăn → nên vẽ **trắng/đơn sắc**; `tint: false` giữ màu gốc. |
| `box.scale` | Cỡ ảnh so với ô, mặc định 0.9. |

## 4. Quy trình

1. Tạo thư mục `<id>/` với `skin.json` + asset. Mẫu: [`_template/pen_example`](_template/pen_example),
   [`_template/box_example`](_template/box_example).
2. Kiểm tra và đóng gói: `pnpm skin:pack <thư mục>` (trong `web/`) → `<id>.okiaskin.zip`
   cạnh thư mục; chỉ kiểm tra: `pnpm skin:validate <thư mục | file.zip>`.
3. Admin → tab Skin → "Nhập gói" (hoặc kéo thả). Máy chủ kiểm tra lại y hệt rồi lưu; skin bật
   ngay, có trong shop sau tối đa 15 s trên mọi tiến trình.
4. "Xuất gói" trả đúng zip này (để sửa rồi nhập lại). "Xuất tất cả" trả bundle nhiều thư mục.

## 5. Những gì KHÔNG nằm trong gói

- Code (JS, shader): engine chỉ nhận tham số và ảnh/âm thanh.
- Giá, thứ tự hiển thị, bật/tắt: quản trị viên chỉnh trên trang admin.
- Font, nhạc nền, skin bàn: chưa hỗ trợ (ADR-0014).
