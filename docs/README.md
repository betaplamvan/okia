# Tài liệu phát triển — "Ô Li" (tên tạm)

Game Dots & Boxes trên web, lấy cảm hứng từ trò chơi trên giấy ô li thời đi học. Dự án cá nhân, phục vụ người chơi Việt Nam.

## Mục lục

| # | Tài liệu | Nội dung |
|---|---|---|
| 01 | [Tổng quan sản phẩm](01-tong-quan.md) | Tầm nhìn, đối tượng, phạm vi, bản sắc |
| 02 | [Kiến trúc & tech stack](02-kien-truc.md) | Sơ đồ hệ thống, công nghệ, cấu trúc repo, triển khai |
| 03 | [Đặc tả luật chơi](03-luat-choi.md) | Mô hình bàn, đánh số cạnh/ô, luật lượt, fixtures dùng chung, bot & cá tính LLM |
| 04 | [Giao thức WebSocket](04-giao-thuc-ws.md) | Các tin nhắn client ↔ server, timer, kết nối lại |
| 05 | [Cơ sở dữ liệu](05-co-so-du-lieu.md) | Schema Postgres, key Redis |
| 06 | [Kinh tế & tiền tệ](06-kinh-te.md) | Ruột chì / Mực tím, cơ chế khóa nạp, shop |
| 07 | [Xếp hạng & ghép trận](07-xep-hang-ghep-tran.md) | Glicko-2, hạng, mùa giải, matchmaking, bot |
| 08 | [Hệ thống skin](08-skin.md) | Loại skin, manifest, animation, âm thanh |
| 09 | [Lộ trình](09-lo-trinh.md) | Các giai đoạn và checklist |
| 10 | [Ghi chú pháp lý](10-phap-ly.md) | Giấy phép, thanh toán, dữ liệu cá nhân |
| 11 | [Responsive & đa ngôn ngữ](11-responsive-i18n.md) | Bố cục mobile-first, canvas, i18n vi/en ở FE và BE, bảng thuật ngữ |
| 12 | [Asset](12-asset.md) | Ba nhóm asset theo nguồn, công cụ, font, pipeline build, quy chuẩn kỹ thuật |
| — | [Quyết định kiến trúc (ADR)](adr/) | Lý do của các lựa chọn quan trọng |

## Quy ước tài liệu

- Viết bằng tiếng Việt; tên kỹ thuật (biến, bảng, API) giữ tiếng Anh.
- Khi thay đổi một quyết định quan trọng: thêm ADR mới trong `adr/` thay vì sửa ADR cũ, rồi cập nhật tài liệu liên quan.
- Các con số cân bằng game (thưởng, giá, ngưỡng hạng…) là **giá trị khởi điểm**, được phép chỉnh khi có dữ liệu thực tế.
