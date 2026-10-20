# 11 — Responsive & đa ngôn ngữ

## Responsive

### Nguyên tắc
- **Thiết kế cho điện thoại trước (mobile-first)**, rồi mở rộng lên tablet và desktop. Đa số người chơi dùng điện thoại.
- Chiều rộng tối thiểu hỗ trợ: **320px**.
- Dùng style props responsive của Chakra UI (`{ base: …, md: … }`), không viết media query riêng lẻ.
- Dùng `100dvh` thay `100vh`; chừa vùng an toàn `env(safe-area-inset-*)` cho tai thỏ và thanh điều hướng.
- Vùng chạm tối thiểu **44×44px** cho mọi nút.

### Breakpoint (mặc định Chakra UI)
| Tên | Từ | Thiết bị điển hình |
|---|---|---|
| `base` | 0 | Điện thoại dọc |
| `sm` | 480px | Điện thoại lớn / ngang |
| `md` | 768px | Tablet |
| `lg` | 992px | Laptop |
| `xl` | 1280px | Desktop |

### Bố cục màn hình chơi

```
Điện thoại dọc (base–sm)          Tablet ngang / desktop (md+)
┌────────────────────┐            ┌──────────┬──────────────┬──────────┐
│ [Bạn 3] ⏱ [Đối thủ 5] │            │  Bạn     │              │ Đối thủ  │
├────────────────────┤            │  3 ô     │    BÀN ĐẤU   │  5 ô     │
│                    │            │  ⏱ 15s   │   (vuông)    │          │
│      BÀN ĐẤU       │            │          │              │ 💬 bot   │
│      (vuông)       │            │ [emote]  │              │ [đầu hàng]│
│                    │            └──────────┴──────────────┴──────────┘
├────────────────────┤
│ [emote]  [đầu hàng]│
└────────────────────┘
```

- Bàn đấu luôn vuông, kích thước = `min(chiều rộng khả dụng, chiều cao khả dụng)` sau khi trừ HUD.
- Xoay màn hình hoặc đổi kích thước cửa sổ → bố cục lại, **không mất trạng thái ván**.

### Canvas PixiJS
- `ResizeObserver` trên khung chứa → tính lại kích thước ô và vẽ lại.
- `resolution = min(devicePixelRatio, 2)` — đủ nét, không quá nặng cho máy yếu.
- Canvas đặt `touch-action: none` để không bị kéo trang, zoom hay pull-to-refresh khi đang vẽ.
- **Bắt cạnh không có vùng chết:** mỗi điểm chạm trên bàn được gán cho cạnh gần nhất, nên dù ô nhỏ vẫn chạm trúng.
- Bàn 7×7 trên màn hình < 400px: bật mặc định **chạm hai lần** (lần đầu xem trước cạnh, lần hai xác nhận). Người chơi tắt được trong cài đặt.

### Font
- Chỉ dùng font có **subset tiếng Việt** (kiểm tra trên Google Fonts), ví dụ *Be Vietnam Pro* cho UI. Font viết tay cho bàn đấu phải thử đủ dấu: "ặ ỗ ữ ỷ".
- `line-height` đủ rộng cho chữ có dấu chồng.

### Kiểm thử
| Kích thước | Đại diện |
|---|---|
| 320×568 | Điện thoại nhỏ nhất hỗ trợ |
| 375×667 | iPhone SE |
| 360×800 | Android tầm trung |
| 768×1024 | iPad dọc |
| 1440×900 | Laptop |

- Kiểm tra thủ công trên **iOS Safari** và **Chrome Android** thật trước mỗi mốc.
- Từ giai đoạn 1: test ảnh chụp màn hình bằng Playwright ở 3 kích thước (360, 768, 1440) × 2 ngôn ngữ.

---

## Đa ngôn ngữ (i18n)

### Ngôn ngữ
- **Tiếng Việt** (`vi`) — mặc định.
- **Tiếng Anh** (`en`).

Thị trường mục tiêu vẫn là Việt Nam; tiếng Anh phục vụ người nước ngoài ở Việt Nam và người chơi thích giao diện tiếng Anh.

### Xác định ngôn ngữ

Thứ tự ưu tiên, dùng chung cho frontend và backend:
1. Lựa chọn đã lưu của người chơi (`users.locale`; với khách: cookie `NEXT_LOCALE`).
2. Header `Accept-Language` của trình duyệt.
3. Mặc định `vi`.

Đổi ngôn ngữ trong cài đặt → lưu cookie, và gọi `PATCH /me { locale }` nếu đã đăng nhập.

### Frontend — `next-intl`
- **URL:** tiếng Việt không có tiền tố (`/play`), tiếng Anh có `/en` (`/en/play`) — `localePrefix: "as-needed"`. Route đặt trong `app/[locale]/`.
- **File dịch:** `web/messages/vi.json`, `web/messages/en.json`, chia theo namespace (`common`, `play`, `shop`, `rank`, `profile`, `errors`…).
- **Type-safe:** khai báo kiểu của `next-intl` từ `vi.json` → dùng key không tồn tại sẽ lỗi khi build.
- **Engine PixiJS** không import thư viện i18n; React truyền vào một hàm `t` khi khởi tạo engine (cho chữ "COMBO", "THẮNG", …).
- **Định dạng số, ngày giờ** qua formatter của `next-intl` (dùng `Intl`): `1.250` (vi) và `1,250` (en).
- **SEO:** thẻ `hreflang` cho mỗi trang; tiêu đề, mô tả và ảnh OG theo ngôn ngữ.
- **Không viết chuỗi cứng trong component.** CI chạy script so sánh tập key của `vi.json` và `en.json`; thiếu key là lỗi.

### Backend — FastAPI
- **Locale của request:** REST lấy theo thứ tự ở trên (header `Accept-Language`); WebSocket nhận `?lang=vi|en` khi kết nối, ưu tiên `users.locale` nếu có.
- **File dịch:** `api/app/i18n/locales/vi.json`, `en.json`; hàm `t(key, locale, **params)`. Thiếu key ở `en` → dùng `vi`. Test kiểm tra hai file có cùng tập key.
- **Lỗi:** luôn trả **mã lỗi ổn định** (`code`, ví dụ `CURRENCY_LOCKED`) và kèm `message` đã dịch. Client ưu tiên tự dịch theo `code`; `message` dùng khi client chưa có bản dịch.
- **Backend phải dịch:**
  - nội dung từ database (tên/mô tả vật phẩm, nhiệm vụ, mùa giải, tên tiền tệ) — xem bên dưới,
  - lời thoại bot: câu soạn sẵn có đủ hai ngôn ngữ; prompt LLM yêu cầu trả lời theo locale của người chơi,
  - nhận xét sau ván, thông báo.

### Nội dung trong database

Các trường hiển thị cho người chơi lưu dạng JSONB có đủ hai ngôn ngữ:

```json
{ "vi": "Bút mực tím", "en": "Purple Ink Pen" }
```

- Ràng buộc `CHECK (name ? 'vi' AND name ? 'en')` để không bao giờ thiếu bản dịch.
- API cho người chơi trả về **chuỗi đã chọn theo locale**; API admin trả về cả object.

### Bảng thuật ngữ

| Tiếng Việt | English |
|---|---|
| Ruột chì (tiền thường) | Lead |
| Mực tím (tiền cao cấp) | Purple Ink |
| Giấy nháp | Scratch Paper |
| Vở ô li | Notebook |
| Học sinh khá | Good Student |
| Học sinh giỏi | Honor Student |
| Thủ khoa | Valedictorian |
| Chơi với máy | Play vs Bot |
| Ghép trận thường | Casual Match |
| Xếp hạng | Ranked |
| Phòng riêng | Private Room |
| Muốn có | Wishlist |
| Sắp mở bán | Coming Soon |

Thêm thuật ngữ mới vào bảng này trước khi dùng, để hai ngôn ngữ luôn thống nhất.
