# 13 — Xác thực & tài khoản

Quyết định: [ADR-0006](adr/0006-xac-thuc-email-google.md) (phiên, Google) và
[ADR-0011](adr/0011-chi-khach-va-google.md) (bỏ email + mật khẩu).

## Hai cách vào game

| Cách | Dành cho | Được gì |
|---|---|---|
| **Khách** (guest) | Chơi thử ngay, không nhập gì | Casual, bot, phòng riêng. Không xếp hạng, không Ruột chì, không điểm danh/nhiệm vụ |
| **Google OAuth** | Vào một chạm, không mật khẩu | Mọi tính năng ngay (email đã được Google xác minh) |

Không có đăng nhập email + mật khẩu (bỏ 2026-10-21), Zalo, Facebook, Apple hay số điện thoại.

## Khách

- Giống noitu, client **tự tạo khách ngay lần đầu vào** (không có màn đăng nhập riêng); bấm pill tên
  / avatar ở header mở hộp thoại hồ sơ với tab *Tài khoản* để đăng nhập Google.
- Hộp hồ sơ (bố cục học noitu, 2026-10-21): dải xanh bảng + avatar to chồng lên, tên giữa, hàng huy hiệu (hạng, `#n mùa này`, ngày tham gia, Khách / Tài khoản Google), nút *Chỉnh sửa hồ sơ* + nút ví (→ cửa hàng), **Tủ trưng bày** (bút + dấu ăn đang trang bị → cửa hàng, huy hiệu hạng → tab Hạng), tab pill *Tổng quan* (thống kê: ván xếp hạng mùa này, thắng, chuỗi điểm danh, kỷ lục) / *Hạng* / *Tài khoản*. Điểm danh và nhiệm vụ ở hộp "Quà mỗi ngày" riêng ([06](06-kinh-te.md)).
- Client sinh `device_id` (UUID) lưu `localStorage`; `POST /auth/guest` → tạo `users(is_guest=true)`
  + `auth_identities(provider='guest', subject=device_id)` → phát token.
- Mất `localStorage` là mất tài khoản khách — chấp nhận, vì khách không có tiến trình đáng giữ.
- Khi khách nâng cấp, identity `guest` bị **gỡ** để device id không mở lại được tài khoản thật sau khi
  đăng xuất; `/auth/guest` gặp identity khách trỏ tới tài khoản đã nâng cấp sẽ tạo khách mới.

## Google OAuth

- **Authorization Code + PKCE**, xử lý ở backend: `POST /auth/google/start` (kèm Bearer nếu đang có
  phiên, để biết khách cần nâng cấp; trả `{url}`) → client chuyển hướng tới Google →
  `GET /auth/google/callback` nhận `code`, đổi lấy `id_token` (httpx), xác minh chữ ký/`aud`/`iss`
  bằng JWKS của Google qua PyJWT. `state` + `code_verifier` lưu Redis 10 phút. Callback chuyển hướng
  về `APP_BASE_URL{return_to}?auth=google|error&code=…`.
- Lấy `sub`, `email`, `email_verified`, `name`, `picture`. Chỉ nhận khi `email_verified = true`.
- Tìm `auth_identities(provider='google', subject=sub)`:
  - Có → đăng nhập.
  - Không có, nhưng `users.email` trùng email Google và tài khoản đó đã xác minh (tài khoản tạo
    trước ADR-0011) → **tự liên kết** Google vào. Trùng email nhưng chưa xác minh → `IDENTITY_TAKEN`.
  - Không có gì → tạo tài khoản mới, `email_verified_at = now()`, avatar từ `picture`, gửi **thư
    chào mừng**.
- Callback kết thúc bằng chuyển hướng về client với refresh cookie đã đặt; không đưa token lên URL.
- Cấu hình: Google Cloud → Google Auth Platform (app *Ô Kìa*, Audience *External*, đã Publish),
  client Web với redirect URI `{API_BASE_URL}/auth/google/callback`; `GOOGLE_CLIENT_ID/SECRET`.

## Gộp tài khoản

Khi người dùng đang có token **khách** và đăng nhập Google:

| Tình huống | Xử lý |
|---|---|
| Google chưa gắn với ai | Nâng cấp **chính** user khách: đặt `email`, thêm identity `google`, `is_guest=false`. Giữ nguyên `user_id`, lịch sử trận |
| Google **đã thuộc tài khoản khác** | Chuyển sang tài khoản đó (`switched=1`); **bỏ** user khách (xóa mềm). Khách không có Ruột chì hay skin nên không mất gì đáng kể; tab Tài khoản ghi rõ trước khi bấm |
| Đang là tài khoản thật, Google thuộc tài khoản khác | `IDENTITY_TAKEN` |

Một tài khoản chỉ có identity `google`; không có thao tác gỡ identity (gỡ là mất đường vào).

## dev-login (ngoài production)

`POST /auth/dev-login {email, displayName?}` tạo/đăng nhập tài khoản đã xác minh với identity
`google` subject `dev:<email>`, đi đúng luồng gộp tài khoản ở trên, **không gửi thư**. Trả 404 khi
`ENV=production`. Dùng cho pytest và smoke test Playwright (không tự động hóa được Google thật).

## Phiên & token

- **Access token:** JWT, hạn **1 giờ**, chứa `sub` (user id), `is_guest`, `email_verified`,
  `token_version`. Gửi qua header `Authorization: Bearer` (REST) hoặc query `token` (WebSocket, xem
  [04](04-giao-thuc-ws.md)).
- **Refresh token:** chuỗi ngẫu nhiên 256-bit, lưu **băm SHA-256** trong bảng `sessions`, hạn **30
  ngày**, cookie `httpOnly; Secure; SameSite=Lax; Path=/auth`. Mỗi lần refresh **xoay** token; dùng lại
  token đã xoay → thu hồi toàn bộ phiên của user (dấu hiệu bị lộ).
- Mọi request kiểm tra `token_version` trong JWT khớp `users.token_version`; "đăng xuất mọi thiết bị"
  chỉ cần tăng số này.
- Trang "Thiết bị đang đăng nhập" (giai đoạn 3) liệt kê `sessions`, cho thu hồi từng phiên.

## Email giao dịch

- Dịch vụ: **Resend** (SDK Python `resend`), gửi từ `Ô Kìa <no-reply@okia.io.vn>` — tên miền
  `okia.io.vn` đã xác minh DKIM/SPF trên Resend (region ap-northeast-1).
- Gọi Resend **ngoài request chính** (background task) với retry 3 lần; thất bại ghi log kèm `user_id`
  và mục đích, không kèm nội dung.
- Mẫu thư (`api/app/auth/emails.py`): chữ lấy từ catalog i18n `emails.*` (vi/en theo `locale` người
  nhận), bọc trong bố cục sticker của game — nền xanh bảng, logo `public/brand/logo-email.png`, thẻ
  giấy viền mực bóng cứng, nút mint, chân thư gạch đứt. Bảng + style inline để Gmail/Outlook hiểu.
  Mẫu hiện có: **`welcome`** (tài khoản Google vừa tạo / khách vừa nâng cấp; không gửi lại khi đăng
  nhập lại). Thêm mẫu mới = thêm khóa `emails.<tên>` vào hai catalog và tên vào `Template`.
- Webhook `email.bounced` / `email.complained` của Resend → `users.email_bounced_at` (chưa làm).
- Test tự động dùng `EMAIL_PROVIDER=console` (giữ trong bộ nhớ, `outbox()`); dev gửi thật qua Resend.
- Không gửi email tiếp thị ([10](10-phap-ly.md#dữ-liệu-cá-nhân)).

## Bảo mật — checklist

- Không lưu mật khẩu; không log token hay nội dung thư.
- `/auth/guest` rate limit theo IP (IP từ `CF-Connecting-IP`, rồi `X-Forwarded-For`); Google `state` một lần, 10 phút.
- WebSocket: tối đa 4 kết nối/tài khoản và 40/IP mỗi tiến trình, 20 tin/giây, tin ≤ 16 KB — xem [04](04-giao-thuc-ws.md#giới-hạn-chống-lạm-dụng-2026-10-21). Token thu hồi có hiệu lực với WS trong ≤ 5 phút nhờ `ws_cache.invalidate` gọi ở mọi chỗ đổi `token_version`.
- Cookie refresh `httpOnly`; access token giữ trong bộ nhớ client, không `localStorage`.
- CORS chỉ cho origin của web; CSRF cho `/auth/refresh` dựa trên `SameSite=Lax` + kiểm tra `Origin`.
- Xóa tài khoản: `DELETE /me` → xóa mềm, ẩn ngay, xóa cứng sau 30 ngày; identity và session xóa ngay
  để không đăng nhập lại được; email giải phóng.

## Mã lỗi

| `code` | Khi nào |
|---|---|
| `UNAUTHORIZED` | Thiếu/sai/hết hạn token |
| `GUEST_NOT_ALLOWED` | Khách gọi tính năng cần tài khoản |
| `EMAIL_NOT_VERIFIED` | Tài khoản cũ chưa xác minh (hiếm, trước ADR-0011) |
| `IDENTITY_TAKEN` | Google đã thuộc tài khoản khác |
| `GOOGLE_DISABLED` | Server chưa cấu hình Google |
| `OAUTH_STATE`, `OAUTH_FAILED`, `OAUTH_CANCELLED`, `OAUTH_EMAIL_UNVERIFIED` | Luồng Google |
| `RATE_LIMITED` | Vượt giới hạn, kèm `retryAfter` |
