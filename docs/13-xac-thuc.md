# 13 — Xác thực & tài khoản

Quyết định: [ADR-0006](adr/0006-xac-thuc-email-google.md).

## Ba cách vào game

| Cách | Dành cho | Được gì |
|---|---|---|
| **Khách** (guest) | Chơi thử ngay, không nhập gì | Casual, bot, phòng riêng. Không xếp hạng, không Ruột chì, không shop |
| **Tài khoản email + mật khẩu** | Người không muốn dùng Google | Mọi tính năng, sau khi **xác minh email** |
| **Google OAuth** | Vào nhanh một chạm | Mọi tính năng ngay (email đã được Google xác minh) |

Không có đăng nhập Zalo, Facebook, Apple, hay số điện thoại. Có thể thêm sau nếu dữ liệu beta cho thấy nhu cầu.

## Khách

- Client sinh `device_id` (UUID) lưu `localStorage`; `POST /auth/guest` → tạo `users(is_guest=true)` + `auth_identities(provider='guest', subject=device_id)` → phát token.
- Mất `localStorage` là mất tài khoản khách — chấp nhận, vì khách không có tiến trình đáng giữ.
- Khách **nâng cấp** thành tài khoản thật bằng cách đăng ký email hoặc đăng nhập Google **trong khi đang giữ token khách** (xem [Gộp tài khoản](#gộp-tài-khoản)).

## Tài khoản email + mật khẩu

### Đăng ký — `POST /auth/register`
- Trường: `email`, `password`, `display_name`, `locale`.
- Email chuẩn hóa `lower(trim())`, duy nhất. Mật khẩu **≥ 8 ký tự**, không giới hạn trên dưới 128, không bắt buộc ký tự đặc biệt; từ chối mật khẩu nằm trong danh sách phổ biến (top 10k).
- Băm bằng **Argon2id** (`argon2-cffi`, tham số mặc định của thư viện).
- Tạo tài khoản với `email_verified_at = NULL`, gửi email xác minh, trả token đăng nhập luôn (không bắt chờ xác minh để chơi casual).
- Nếu email đã tồn tại: trả **cùng phản hồi** như thành công và gửi email "ai đó vừa thử đăng ký bằng địa chỉ của bạn" — không tiết lộ email đã có tài khoản.

### Xác minh email — `GET /auth/verify?token=…`
- Token là JWT ký bởi server, `purpose=verify`, hạn **24 giờ**, có `jti`; dùng xong ghi `token:used:{jti}` vào Redis (TTL bằng hạn còn lại) để **chỉ dùng một lần**.
- Chưa xác minh thì **không được chơi xếp hạng** (và do đó không có Ruột chì). Lý do: email xác minh là rào cản tối thiểu chống tạo hàng loạt tài khoản để dàn xếp kết quả.
- Gửi lại email xác minh: tối đa 3 lần/giờ.

### Đăng nhập — `POST /auth/login`
- `email` + `password`. Sai gì cũng trả `INVALID_CREDENTIALS`, không phân biệt "email không tồn tại" và "sai mật khẩu".
- Giới hạn: **5 lần sai / 15 phút** theo email và theo IP (`rl:login:*` trong Redis). Vượt → `RATE_LIMITED` kèm thời gian chờ.
- Thành công → phát token, ghi `sessions`.

### Quên mật khẩu — `POST /auth/forgot`, `POST /auth/reset`
- `forgot` luôn trả thành công; nếu email có tài khoản mật khẩu thì gửi link đặt lại (JWT `purpose=reset`, hạn **30 phút**, một lần).
- `reset` đặt mật khẩu mới, **tăng `users.token_version`** → mọi phiên cũ bị vô hiệu, rồi phát token mới.
- Tài khoản chỉ có Google mà gửi `forgot` → email nhắc "tài khoản này đăng nhập bằng Google".

### Đổi mật khẩu, đổi email
- Đổi mật khẩu cần mật khẩu hiện tại; đổi email gửi xác minh tới địa chỉ mới, chỉ đổi khi xác minh xong. Cả hai nằm ở giai đoạn 3 (`PATCH /me/security`).

## Google OAuth

- **Authorization Code + PKCE**, xử lý ở backend: `GET /auth/google/start` → chuyển hướng Google → `GET /auth/google/callback` nhận `code`, đổi lấy `id_token`, xác minh chữ ký và `aud` bằng thư viện `google-auth`.
- Lấy `sub`, `email`, `email_verified`, `name`, `picture`. Chỉ nhận khi `email_verified = true`.
- Tìm `auth_identities(provider='google', subject=sub)`:
  - Có → đăng nhập.
  - Không có, nhưng `users.email` trùng với email Google và tài khoản đó đã xác minh → **tự động liên kết** Google vào tài khoản đó (an toàn vì cả hai phía đều đã xác minh cùng email).
  - Không có gì → tạo tài khoản mới, `email_verified_at = now()`, avatar từ `picture`.
- `state` chống CSRF lưu trong cookie ngắn hạn. Callback kết thúc bằng chuyển hướng về client với refresh cookie đã đặt; không đưa token lên URL.

## Gộp tài khoản

Khi người dùng đang có token **khách** và thực hiện đăng ký/đăng nhập:

| Tình huống | Xử lý |
|---|---|
| Đăng ký email mới | Nâng cấp **chính** user khách: đặt `email`, thêm identity `password`, `is_guest=false`. Giữ nguyên `user_id`, loadout, lịch sử trận |
| Google chưa gắn với ai | Nâng cấp user khách tương tự, thêm identity `google` |
| Email/Google **đã thuộc tài khoản khác** | Chuyển sang tài khoản đó; **bỏ** user khách (xóa mềm sau 30 ngày). Khách không có Ruột chì hay skin nên không mất gì đáng kể; thông báo rõ trước khi chuyển |

Một tài khoản có thể có đồng thời identity `password` và `google`. Gỡ một identity chỉ được phép khi vẫn còn ít nhất một cách đăng nhập.

## Phiên & token

- **Access token:** JWT, hạn **1 giờ**, chứa `sub` (user id), `is_guest`, `email_verified`, `token_version`. Gửi qua header `Authorization: Bearer` (REST) hoặc query `token` (WebSocket, xem [04](04-giao-thuc-ws.md)).
- **Refresh token:** chuỗi ngẫu nhiên 256-bit, lưu **băm SHA-256** trong bảng `sessions`, hạn **30 ngày**, đặt trong cookie `httpOnly; Secure; SameSite=Lax; Path=/auth`. Mỗi lần refresh **xoay** token (token cũ bị thu hồi); dùng lại token đã xoay → thu hồi toàn bộ phiên của user (dấu hiệu bị lộ).
- Mọi request kiểm tra `token_version` trong JWT khớp `users.token_version`; đổi mật khẩu hoặc "đăng xuất mọi thiết bị" chỉ cần tăng số này.
- Trang "Thiết bị đang đăng nhập" (giai đoạn 3) liệt kê `sessions`, cho thu hồi từng phiên.

## Email giao dịch

- Dịch vụ: **Resend** (SDK Python `resend`; gói miễn phí 3.000 email/tháng, 100/ngày — đủ cho giai đoạn đầu). Gửi từ tên miền riêng đã xác minh trên Resend, cấu hình SPF/DKIM/DMARC theo hướng dẫn của họ.
- Gọi Resend **ngoài request chính** (background task) với retry 3 lần; thất bại ghi log kèm `user_id` và mục đích, không kèm nội dung.
- Bật webhook `email.bounced` / `email.complained` của Resend → đánh dấu `users.email_bounced_at` để không gửi lại và nhắc người dùng đổi email.
- Ba mẫu: xác minh, đặt lại mật khẩu, cảnh báo đăng ký trùng. Mỗi mẫu có **vi và en**, chọn theo `locale` của người nhận; nội dung text thuần + HTML tối giản.
- Môi trường dev: in ra log hoặc dùng **Mailpit** trong Docker Compose, không gửi thật.
- Không gửi email tiếp thị; email chỉ dùng cho bảo mật tài khoản ([10](10-phap-ly.md#dữ-liệu-cá-nhân)).

## Bảo mật — checklist

- Argon2id; không bao giờ log mật khẩu, token hay nội dung email đặt lại.
- Mọi endpoint `/auth/*` có rate limit theo IP; `register` và `forgot` thêm giới hạn theo email.
- So sánh băm bằng hàm thời gian hằng định.
- Cookie refresh `httpOnly`; access token giữ trong bộ nhớ client, không `localStorage`.
- CORS chỉ cho origin của web; CSRF cho `/auth/refresh` dựa trên `SameSite=Lax` + kiểm tra header `Origin`.
- Xóa tài khoản: `DELETE /me` → xóa mềm, ẩn ngay, xóa cứng sau 30 ngày; identity và session xóa ngay để không đăng nhập lại được.

## Mã lỗi

| `code` | Khi nào |
|---|---|
| `INVALID_CREDENTIALS` | Email/mật khẩu sai (không phân biệt) |
| `EMAIL_NOT_VERIFIED` | Vào xếp hạng khi chưa xác minh |
| `GUEST_NOT_ALLOWED` | Khách gọi tính năng cần tài khoản |
| `WEAK_PASSWORD` | Mật khẩu < 8 ký tự hoặc quá phổ biến |
| `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_USED` | Link xác minh/đặt lại |
| `IDENTITY_TAKEN` | Google/email đã thuộc tài khoản khác (kèm gợi ý chuyển tài khoản) |
| `LAST_IDENTITY` | Gỡ cách đăng nhập cuối cùng |
| `RATE_LIMITED` | Vượt giới hạn, kèm `retryAfter` |
