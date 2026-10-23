# Tài liệu phát triển — Ô Kìa

Game Dots & Boxes trên web, lấy cảm hứng từ trò chơi trên giấy ô li thời đi học. Dự án cá nhân, phục vụ người chơi Việt Nam.

- **Tên public:** Ô Kìa (giữ nguyên ở mọi ngôn ngữ, không dịch).
- **Tên ASCII:** `okia` — dùng cho repo, tên miền, tên gói, tài khoản mạng xã hội.
- **Mô tả:** vi *"Ô Kìa — trò ăn ô trên giấy ô li"*; en *"Ô Kìa — dots & boxes, Vietnamese style"*.

## Mục lục

| # | Tài liệu | Nội dung |
|---|---|---|
| 01 | [Tổng quan sản phẩm](01-tong-quan.md) | Tầm nhìn, đối tượng, phạm vi, bản sắc |
| 02 | [Kiến trúc & tech stack](02-kien-truc.md) | Sơ đồ hệ thống, công nghệ, cấu trúc repo, triển khai |
| 03 | [Đặc tả luật chơi](03-luat-choi.md) | Mô hình bàn, đánh số cạnh/ô, luật lượt, fixtures dùng chung, bot & cá tính LLM |
| 04 | [Giao thức WebSocket](04-giao-thuc-ws.md) | Các tin nhắn client ↔ server, timer, kết nối lại |
| 05 | [Cơ sở dữ liệu](05-co-so-du-lieu.md) | Schema Postgres, key Redis |
| 06 | [Kinh tế & donate](06-kinh-te.md) | Ruột chì (một loại tiền, miễn phí, từ xếp hạng), ví, shop, donate |
| 07 | [Xếp hạng & ghép trận](07-xep-hang-ghep-tran.md) | Rating ẩn Glicko-2, điểm hạng hiển thị, mùa giải, matchmaking nới dần, chốt trận, BXH |
| 08 | [Hệ thống skin](08-skin.md) | Bút và ô đã ăn, năm bậc hiếm, manifest, hiệu ứng, âm thanh theo bút, shop |
| 09 | [Lộ trình](09-lo-trinh.md) | Các giai đoạn và checklist |
| 10 | [Ghi chú pháp lý](10-phap-ly.md) | Giấy phép, donate, dữ liệu cá nhân |
| 11 | [Responsive & đa ngôn ngữ](11-responsive-i18n.md) | Bố cục mobile-first, canvas, i18n vi/en ở FE và BE, bảng thuật ngữ |
| 12 | [Asset](12-asset.md) | Ba nhóm asset theo nguồn, công cụ, font, pipeline build, quy chuẩn kỹ thuật |
| 13 | [Xác thực & tài khoản](13-xac-thuc.md) | Khách, email + mật khẩu, Google OAuth, gộp tài khoản, phiên, email giao dịch, bảo mật |
| 14 | [Thiết kế giao diện](14-thiet-ke-giao-dien.md) | Phong cách "sticker vở ô li", token màu/bóng/font, thành phần, bố cục trang chủ |
| 15 | [Chat tổng](15-chat.md) | Bong bóng chat chung: quyền, giới hạn tốc độ, API, WS `chat_watch`/`chat_msg`, giao diện |
| — | [Quyết định kiến trúc (ADR)](adr/) | Lý do của các lựa chọn quan trọng |

## Quy ước tài liệu

- Viết bằng tiếng Việt; tên kỹ thuật (biến, bảng, API) giữ tiếng Anh.
- Khi thay đổi một quyết định quan trọng: thêm ADR mới trong `adr/` thay vì sửa ADR cũ, rồi cập nhật tài liệu liên quan.
- Các con số cân bằng game (thưởng, giá, ngưỡng hạng…) là **giá trị khởi điểm**, được phép chỉnh khi có dữ liệu thực tế.
