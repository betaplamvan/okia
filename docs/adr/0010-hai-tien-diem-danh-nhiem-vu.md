# ADR-0010 — Hai loại tiền miễn phí, điểm danh, nhiệm vụ, ảnh đại diện tự tải

- **Ngày:** 2026-10-21
- **Trạng thái:** Chấp nhận — **thay một phần [ADR-0005](0005-mot-tien-te-donate.md)** (điểm "một loại tiền") và **[ADR-0007](0007-thanh-tuu-cap-do-ruong.md)** (điểm "không thêm loại tiền thứ hai", "không có nhiệm vụ lặp"). Phần còn lại (không thanh toán, donate không quyền lợi, thành tựu/EXP/rương) giữ nguyên.

## Bối cảnh

Sau khi lên production (okia.io.vn), người phát triển muốn học noitu.fun đầy đủ hơn về vòng lặp giữ chân: hai loại tiền (xu + kim cương, đều miễn phí), điểm danh hằng ngày, nhiệm vụ ngày/tuần, hồ sơ có ảnh đại diện riêng. ADR-0005/0007 trước đó chọn một loại tiền và tránh nhiệm vụ lặp để chống cày; đổi lại người chơi casual/bot có rất ít lý do quay lại mỗi ngày.

## Quyết định

1. **Hai loại tiền, cả hai miễn phí, không bao giờ bán:**
   - **Ruột chì** (`lead`) — tiền chính: thắng xếp hạng, thành tựu, **điểm danh**, **nhiệm vụ**, thưởng mùa. Mua skin lẻ, rương, thẻ chức năng.
   - **Hoa điểm tốt** (`flower`) — tiền phụ, hiếm (vai trò như "kim cương" của noitu): ngày 7 của chu kỳ điểm danh, nhiệm vụ tuần, và **vật phẩm trùng khi mở rương** (thay cho "hoàn 50% Ruột chì" ở ADR-0007). Dùng mua vật phẩm giới hạn / huyền thoại và một số thẻ.
2. **Điểm danh:** chu kỳ 7 ngày theo giờ Việt Nam; lỡ một ngày về ngày 1. Thưởng khởi điểm: 10 / 10 / 15 / 15 / 20 / 20 Ruột chì, ngày 7: 30 Ruột chì + 1 Hoa.
3. **Nhiệm vụ:** danh mục cố định trong code, 3 ngày + 3 tuần, reset 0h VN (tuần: thứ Hai). Tiến trình đến từ kết thúc ván: server ghi với phòng online; **ván với máy (đang chạy ở client) do client báo** qua `POST /me/events` có giới hạn tần suất — chấp nhận rủi ro gian lận nhỏ cho tới P2-06 (bot chạy ở server). Ván `afk` hoặc đầu hàng trước nước thứ 10 không tính.
4. **Nhận thưởng** (điểm danh, nhiệm vụ) cần **tài khoản đã xác minh email** (Google là xác minh sẵn) — rào cản tối thiểu chống tạo hàng loạt tài khoản để cày. Khách và tài khoản chưa xác minh vẫn **thấy** tiến trình.
5. **Ảnh đại diện tự tải:** client cắt vuông, server chuẩn hóa WebP 256px ≤ 120 KB rồi ghi lên **MinIO/S3** (`avatars/{id}/{n}.webp`, `app/storage.py`, boto3); `users.avatar_seq` tăng mỗi lần tải nên mỗi ảnh một URL mới, cache bất biến (kể cả Cloudflare trước MinIO) không bao giờ dính ảnh cũ; object cũ dọn ngay sau khi đổi/xóa. Bucket cho đọc ẩn danh prefix `avatars/` (`scripts/s3_setup.py`) nên trình duyệt tải thẳng từ bucket; chưa đặt `S3_PUBLIC_URL` thì API phục vụ hộ qua `GET /avatars/{id}/{n}.webp`. *Sửa 2026-10-21:* bản đầu lưu blob trong Postgres (`avatar_blob`), đổi sang object storage theo yêu cầu tách dữ liệu người dùng khỏi máy chạy backend. **Miễn phí** ở giai đoạn này; "Thẻ avatar tùy chỉnh" trong ADR-0007 bỏ (giữ thẻ đổi tên).
6. Mọi thay đổi số dư vẫn qua `credit/debit` + `wallet_ledger` (cột `currency`), khóa idempotency; xem [06](../06-kinh-te.md#quy-tắc-ví).

## Hệ quả

- ➕ Có lý do quay lại mỗi ngày cho mọi đối tượng; vòng lặp quen thuộc với người chơi noitu.
- ➕ Vẫn không có tiền thật; Hoa điểm tốt có nguồn hữu hạn theo thời gian (tối đa 1/tuần điểm danh + 2/tuần nhiệm vụ) nên khó lạm phát.
- ➖ Nhiệm vụ lặp là nguồn Ruột chì mới → trần ngày tự nhiên ≈ 35 (3 nhiệm vụ) + 10–30 (điểm danh); cần theo dõi khi có shop.
- ➖ Ván bot do client báo có thể giả mạo cho tới khi bot chạy ở server (P2-06); giới hạn 30 sự kiện/giờ và mỗi ván ≥ 24 nước.
- ➖ Thêm 4 bảng (`wallets`, `wallet_ledger`, `checkins`, `quest_progress`) và 2 cột `users`.
