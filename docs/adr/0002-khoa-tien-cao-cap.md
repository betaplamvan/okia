# ADR-0002 — Xây đủ hai loại tiền nhưng khóa Mực tím

- **Ngày:** 2026-10-20
- **Trạng thái:** **Đã thay thế** bởi [ADR-0005](0005-mot-tien-te-donate.md) (2026-10-20) — chỉ giữ lại để tham khảo lịch sử

## Bối cảnh

Muốn có hai loại tiền: Ruột chì (kiếm bằng cách chơi) và Mực tím (nạp tiền thật). Chưa có cổng thanh toán, và dự án cá nhân chưa thể xin giấy phép thu phí (xem [10-phap-ly](../10-phap-ly.md)).

## Quyết định

- Xây **đầy đủ** cả hai loại tiền: bảng `currencies`, ví, sổ cái, giá vật phẩm theo cả hai loại.
- Mực tím bị **khóa**: `currencies.enabled = false` cho `hard`, `PAYMENTS_ENABLED=false`.
- Vật phẩm cao cấp vẫn **hiển thị kèm giá** trong shop, có nút "Thử" và "Muốn có", nhưng **không ai có thể sở hữu**.
- Việc chặn được thực hiện **ở server** (mua, cộng tiền, trang bị, nạp) — không chỉ ở giao diện.

## Hệ quả

- ➕ Mở bán sau này chỉ cần tích hợp cổng thanh toán và bật cờ — không đổi schema, không sửa shop.
- ➕ Wishlist cho dữ liệu nhu cầu thật trước khi đầu tư vào thanh toán.
- ➖ Người chơi thấy vật phẩm không mua được → cần thông điệp "Sắp mở bán" rõ ràng để tránh khó chịu.
- ➖ Thêm một lớp kiểm tra và bộ test bắt buộc trong service ví.
