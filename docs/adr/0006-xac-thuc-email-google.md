# ADR-0006 — Xác thực: khách, email + mật khẩu, Google OAuth; bỏ Zalo

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận; **sửa đổi bởi [ADR-0011](0011-chi-khach-va-google.md)** (2026-10-21): bỏ email + mật khẩu, chỉ còn khách + Google.

## Bối cảnh

Kế hoạch cũ: khách, Google OAuth, Zalo OAuth. Người phát triển muốn người chơi có thể **tự tạo tài khoản** (không phụ thuộc Google) hoặc **đăng nhập Google**. Kinh tế game ([ADR-0005](0005-mot-tien-te-donate.md)) chỉ trao Ruột chì qua xếp hạng, và xếp hạng cần tài khoản thật, nên xác thực phải đủ chắc để hạn chế tạo hàng loạt tài khoản.

## Quyết định

- Ba cách vào game: **khách** (chơi thử), **email + mật khẩu**, **Google OAuth**.
- Tài khoản mật khẩu phải **xác minh email** trước khi chơi xếp hạng.
- **Bỏ Zalo OAuth** khỏi kế hoạch (Zalo chỉ còn là kênh chia sẻ link). Cân nhắc lại nếu beta cho thấy nhu cầu.
- Phiên: access JWT 1 giờ + refresh token xoay 30 ngày trong cookie `httpOnly`; thu hồi bằng `token_version`.
- Email giao dịch qua **Resend**, mẫu vi/en. Chi tiết: [13](../13-xac-thuc.md).

## Phương án đã loại

- **Chỉ Google:** loại vì một phần người chơi không muốn gắn Google, và phụ thuộc một nhà cung cấp duy nhất.
- **Số điện thoại + OTP:** loại vì tốn phí SMS và là dữ liệu cá nhân nhạy cảm hơn.
- **Magic link (chỉ email, không mật khẩu):** đơn giản hơn nhưng mỗi lần đăng nhập đều phải mở email, kém tiện trên điện thoại; có thể thêm sau như lựa chọn phụ.

## Hệ quả

- ➕ Người chơi có lựa chọn; không phụ thuộc Google; email xác minh làm rào cản tối thiểu chống đa tài khoản.
- ➖ Phải tự lo băm mật khẩu, đặt lại mật khẩu, rate limit, email giao dịch — thêm ~2 buổi ở giai đoạn 1 và một dịch vụ email ngoài.
- ➖ Lưu email người chơi → cập nhật chính sách quyền riêng tư ([10](../10-phap-ly.md)).
