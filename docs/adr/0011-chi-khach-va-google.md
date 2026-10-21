# ADR-0011 — Bỏ email + mật khẩu: chỉ còn khách và Google

- **Ngày:** 2026-10-21
- **Trạng thái:** Chấp nhận (sửa đổi [ADR-0006](0006-xac-thuc-email-google.md))

## Bối cảnh

ADR-0006 cho ba cách vào game: khách, email + mật khẩu, Google. Sau khi lên production
(okia.io.vn) và bật Google OAuth, người phát triển nhận thấy mật khẩu là gánh nặng cho người chơi
(dễ quên, phải đặt lại qua email) và cho dự án (băm Argon2id, danh sách mật khẩu phổ biến, token
xác minh/đặt lại, rate limit, ba mẫu thư). Người chơi mục tiêu (Việt Nam, điện thoại) hầu như ai
cũng có Gmail.

## Quyết định

- **Hai cách vào game:** khách (device id, tự tạo lần đầu vào) và **Google OAuth**. Không có mật
  khẩu, không đăng ký email.
- Tài khoản Google luôn có email đã xác minh → mọi tính năng mở ngay; `verified_user` giữ nguyên
  để chặn khách.
- Gỡ: `POST /auth/register|login|verify|resend-verify|forgot|reset`, `POST /me/password`,
  `DELETE /me/identities/*`, cột `auth_identities.secret_hash`, phụ thuộc `argon2-cffi`, trang
  `/auth/verify`, `/auth/reset`.
- Dữ liệu cũ: identity `password` bị xóa; tài khoản chỉ có mật khẩu mà **đã xác minh email** giữ
  lại — đăng nhập Google cùng email sẽ tự liên kết; tài khoản **chưa xác minh** xóa mềm để giải
  phóng email.
- Email giao dịch chỉ còn **thư chào mừng** khi tài khoản Google vừa tạo / khách vừa nâng cấp, gửi
  từ `no-reply@okia.io.vn` (tên miền đã xác minh trên Resend), bố cục sticker của game.
- Ngoài production có `POST /auth/dev-login` (tài khoản đã xác minh theo email, không gửi thư) để
  smoke test và dev không cần Google thật.

## Phương án đã loại

- **Magic link qua email:** vẫn phải mở hộp thư mỗi lần đăng nhập trên điện thoại; Google một chạm
  tiện hơn.
- **Thêm Facebook/Zalo/Apple:** chưa có nhu cầu; mỗi nhà cung cấp thêm một màn xét duyệt.

## Hệ quả

- ➕ Ít code và ít bề mặt tấn công hơn; không lưu mật khẩu; người chơi không phải nhớ gì.
- ➖ Phụ thuộc Google: Google khóa tài khoản thì mất đường vào. Chấp nhận ở quy mô hiện tại; nếu
  cần, thêm nhà cung cấp OAuth thứ hai (không quay lại mật khẩu).
- ➖ Không có Gmail thì chỉ chơi được với tư cách khách.
