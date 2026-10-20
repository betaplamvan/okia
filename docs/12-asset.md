# 12 — Asset: nguồn, công cụ, quy trình

## Nguyên tắc

- **Ưu tiên vẽ bằng code**, rồi đến SVG, cuối cùng mới là raster. Phong cách "bút trên giấy" cho phép phần lớn hình ảnh được tạo thủ tục, co giãn mọi độ phân giải, đổi màu theo skin tức thì.
- **Giai đoạn 0 không phụ thuộc asset ngoài:** skin mặc định và âm thanh tạm được tạo bằng code/SVG/tổng hợp. Asset thật thay dần sau.
- **Mọi asset ngoài phải có giấy phép rõ** và được ghi vào `docs/credits.md` ngay khi thêm (tên, tác giả, nguồn, giấy phép).
- Không dùng tên, logo, kiểu dáng đặc trưng của thương hiệu thật (xem [10](10-phap-ly.md#nội-dung--thương-hiệu)).

## Ba nhóm asset theo nguồn

| Nhóm | Gồm | Cách làm | Ai làm |
|---|---|---|---|
| **1. Thủ tục (code)** | Lưới ô li, chấm, nét bút, gạch chéo, tô ô, particle, chữ COMBO, hiệu ứng đóng dấu, mực loang, phấn | PixiJS Graphics + `rough.js` (đường vẽ tay) + texture nhỏ lặp (pencil grain) + shader | Code |
| **2. Vector (SVG)** | Con dấu, chữ ký, sticker, huy hiệu hạng, icon menu, logo, ảnh OG, khung avatar | Viết SVG trong code → chỉnh trong Figma/Inkscape → rasterize theo nhu cầu | Code viết nháp, người chỉnh |
| **3. Raster & âm thật** | Texture giấy/bảng đen/giấy kraft, ảnh nền shop, tiếng bút sột soạt thật, trống trường | CC0, tự thu/chụp, hoặc AI (kiểm tra điều khoản) | Người |

## Công cụ

| Việc | Công cụ | Ghi chú |
|---|---|---|
| Vector, UI mockup, sửa SVG | **Figma** (web) hoặc **Inkscape** | Miễn phí. Xuất SVG "plain" để tránh thẻ thừa |
| Vẽ/chỉnh raster, texture | **Krita** | Miễn phí. Có brush bút chì, phấn |
| SFX tổng hợp nhanh | **jsfxr**, **ChipTone** (web) | Cho tiếng UI; tiếng bút thì thu thật tốt hơn |
| Cắt, chuẩn hóa âm | **Audacity** | Normalize về −1 dBFS, cắt im lặng, fade 5 ms |
| Atlas | `@pixi/assetpack` hoặc **free-tex-packer** | Tự động trong build |
| Audio sprite | `audiosprite` (npm, cần ffmpeg) | Xuất `.webm` + `.mp3` dự phòng |
| Kiểm tra font tiếng Việt | Script Python `fontTools` | Kiểm tra cmap có đủ ký tự Việt |
| Nén ảnh | `sharp` (Node) | PNG → WebP, giữ PNG cho texture cần alpha chính xác |

### Nguồn miễn phí (CC0)
- Âm thanh: [Kenney.nl](https://kenney.nl/assets?q=audio), [freesound.org](https://freesound.org) (lọc CC0).
- Texture: [ambientCG](https://ambientcg.com), [Pixabay](https://pixabay.com) (đọc kỹ giấy phép từng ảnh).
- Font: Google Fonts, lọc subset `vietnamese`.

### Tự thu / tự chụp (khuyến nghị cho bản sắc)
- Tiếng bút chì, bút bi, phấn, lật vở, đóng dấu: thu bằng điện thoại trong phòng yên tĩnh, cách mic 10–20 cm, thu nhiều lần để có biến thể (3–4 biến thể mỗi tiếng, phát ngẫu nhiên để không nhàm).
- Vở ô li, giấy kiểm tra, bảng đen thật: chụp dưới ánh sáng đều, chỉnh phẳng và cân màu trong Krita → texture nền.

### AI tạo ảnh / âm
- Dùng được cho texture nền và ảnh minh họa shop. Kiểm tra điều khoản sử dụng thương mại của công cụ; không tạo hình nhái thương hiệu; ghi nguồn trong `credits.md` như asset khác.

## Font

- **UI:** *Be Vietnam Pro* (có đủ tiếng Việt, nhiều độ đậm) — **đã chốt** (P0-04).
- **Viết tay (bàn đấu, HUD):** *Patrick Hand* — **đã chốt** (P0-04) sau khi kiểm tra trên trang dev `/dev/fonts` (chỉ có ở môi trường development): đủ dấu chồng `ặ ỗ ữ ỷ ẫ ắ ờ ứ ễ ỵ đ Đ` từ 14px tới 48px. Chụp lại bằng `pnpm shots http://localhost:3000 /dev/fonts` khi đổi font.
- Tự host font (woff2, subset `latin` + `vietnamese`) qua `next/font`, không tải từ Google lúc chạy.

## Cấu trúc thư mục

```
shared/
├─ skins/
│  ├─ pen/pen_ink_purple.json          # manifest (xem 08)
│  ├─ pen/pen_ink_purple/              # asset nguồn của skin
│  │  ├─ nib.svg
│  │  └─ sfx/draw_01.wav, draw_02.wav
│  └─ ...
├─ ui/
│  ├─ icons/*.svg                      # icon menu
│  ├─ badges/tier_*.svg                # huy hiệu hạng
│  └─ og/*.svg                         # ảnh OG (render theo ngôn ngữ)
├─ audio/
│  └─ core/*.wav                       # âm dùng chung: ting, turn, drum, win, lose
└─ fonts/
web/public/assets/                     # OUTPUT của pipeline, không sửa tay, có trong .gitignore
```

## Pipeline (`pnpm assets:build`)

1. **SVG → PNG/WebP** ở các độ phân giải cần (1x, 2x) bằng `sharp`/`resvg`; SVG đơn giản (icon) giữ nguyên và dùng trực tiếp.
2. **Đóng gói atlas** theo skin (`skins/<id>.json` + `.webp`) để một skin tải một request.
3. **Audio sprite:** chuẩn hóa WAV → ghép thành `core.webm`/`core.mp3` + map thời gian; mỗi skin có sprite riêng nếu có tiếng riêng.
4. **Kiểm tra manifest:** đủ `name.vi`/`name.en`, mọi file được tham chiếu tồn tại, kích thước asset mỗi skin ≤ 300 KB.
5. **Xuất** vào `web/public/assets/` kèm hash trong tên file để cache lâu trên CDN.

Chạy trong CI; manifest hỏng hoặc thiếu file → build đỏ.

## Chu trình làm việc với asset

```
Code viết SVG/nháp ──▶ Người xem trên /dev/skins ──▶ Người chỉnh trong Figma/Krita
        ▲                                                       │
        └──────── Code đọc file đã sửa, nhận xét, cập nhật manifest ◀──┘
```

- Trang `/dev/skins` (chỉ dev) hiển thị mọi skin trên bàn mẫu, có nút phát từng âm thanh, bật/tắt từng hiệu ứng, so sánh trên nền sáng/tối.
- Với âm thanh: code tổng hợp bản tạm và dựng sprite; **người nghe và quyết định** — code không nghe được.
- Với hình: code có thể xem ảnh PNG/JPG để nhận xét bố cục, màu, độ tương phản.

## Quy chuẩn kỹ thuật

| Loại | Quy chuẩn |
|---|---|
| Sprite đầu bút, con dấu, sticker | SVG nguồn; PNG/WebP 128px và 256px; nền trong suốt |
| Texture nét bút (lặp) | PNG grayscale 256×64, lặp ngang, dùng làm alpha mask nhân với màu người chơi |
| Texture nền bàn | WebP 1024×1024 (lặp được) hoặc 1080×1920 cho nền không lặp; ≤ 150 KB |
| Âm thanh | WAV 48 kHz mono khi nguồn; xuất Opus trong webm 64 kbps + mp3 96 kbps; mỗi tiếng ≤ 1,5 s |
| Icon UI | SVG 24×24 grid, stroke 1,5–2 px, `currentColor` để đổi theo theme |
| Màu người chơi | 2 màu chính (xanh bút bi `#1e4fd8`, đỏ bút đỏ `#d8341e`) phải phân biệt được với người mù màu đỏ-lục → kèm hình dạng khác (nét liền / nét có gạch) khi bật tùy chọn hỗ trợ |

## Lộ trình asset (song song với [09](09-lo-trinh.md))

| Khi | Việc |
|---|---|
| Giai đoạn 0 | Skin mặc định 100% thủ tục; âm tạm tổng hợp hoặc CC0; chọn font viết tay; logo và icon SVG nháp |
| Giai đoạn 1 | Ảnh OG theo ngôn ngữ; thu tiếng bút thật thay bản tạm; `credits.md` |
| Giai đoạn 2B | 12 skin đầu (3 mỗi loại): ít nhất 8 skin thuần thủ tục/SVG, tối đa 4 skin cần raster; huy hiệu 5 hạng; pipeline chạy trong CI |
| Giai đoạn 3 | Skin sự kiện; cân nhắc thuê họa sĩ cho skin `legendary` khi có ngân sách |
