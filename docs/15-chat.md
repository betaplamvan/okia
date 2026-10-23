# 15 — Chat tổng

Kênh chat chung toàn trang (2026-10-23), học bố cục bong bóng của noitu.fun. Đợt đầu: chat, trả lời trích dẫn, số người online, đếm tin chưa đọc, giới hạn tốc độ. **Chưa có:** lọc từ tục, báo cáo, admin xóa tin / cấm chat, mini-game trong chat (làm đợt sau — cột `deleted_at` đã có sẵn cho xóa mềm).

## Quyền

| Ai | Đọc | Gửi |
|---|---|---|
| Khách / chưa đăng nhập | ✓ | ✗ — khung nhập khóa, nút "Đăng nhập" mở tab Tài khoản |
| Tài khoản Google | ✓ | ✓ |
| Tài khoản bị khóa (`banned_until`) | — | ✗ (`BANNED`) |

## Giới hạn (chống spam)

Các mức dưới đây là **mặc định**, admin chỉnh được ở /admin → Thông số (`chat_enabled`, `chat_max_len`, `chat_min_interval_seconds`, `chat_per_minute`, `chat_dup_seconds` — [06](06-kinh-te.md#thông-số-chỉnh-ở-admin-2026-10-22)). `chat_enabled` tắt → `POST` trả `CHAT_DISABLED`, `GET /site.chatEnabled = false`, khung nhập báo tạm đóng.

- 1 tin / 2 giây và 12 tin / phút mỗi người (`RATE_LIMITED`, kèm `retryAfter`).
- Không gửi lại đúng nội dung (không phân biệt hoa thường / khoảng trắng) trong 30 giây (`CHAT_DUPLICATE`).
- 1–300 ký tự, tối đa 6 dòng (dòng thừa gộp vào dòng 6), không quá một dòng trống liền nhau (`CHAT_EMPTY`, `CHAT_TOO_LONG`).
- Nội dung hiển thị dạng chữ thuần (không HTML, không tự tạo link).

## API

| | |
|---|---|
| `GET /chat/meta` | `{online, lastId}` — bong bóng hỏi mỗi 30 giây khi tab đang hiện; người gọi (có token) được tính online (zset `online` dùng chung với ghép trận) |
| `GET /chat/messages?before=<id>` | `{items, hasMore}` — 50 tin, cũ → mới; ai cũng đọc được |
| `POST /chat/messages` `{body, replyTo?}` | Gửi (tài khoản Google). Trả tin vừa tạo; đồng thời publish Redis `chat:all` → WS `chat_msg` cho mọi kết nối đang `chat_watch` |

Một tin: `{id, userId, name, avatarUrl, donor, rank, body, createdAt, reply?}` — `rank` là hạng mùa hiện tại (null khi đang phân hạng), `donor` = đã ủng hộ (Trống Đồng nhỏ cạnh tên), `reply = {id, name, body (≤ 80 ký tự), deleted}`.

## WebSocket

`chat_watch` / `chat_unwatch` (client) bật/tắt nhận `chat_msg` (server). Hub giữ tập kết nối đang xem chat, nghe kênh `chat:*` (xem [04](04-giao-thuc-ws.md)). WS chỉ nối khi mở khung chat — đóng khung vẫn giữ kết nối nhưng ngừng nhận tin; nối lại khi khung đang mở → client gửi lại `chat_watch` và tải lại 50 tin cuối để bù tin lỡ.

## Giao diện

- `web/src/components/chat/chat-host.tsx` (gắn trong AppShell, **ranh giới Suspense riêng** để các host khác tạm treo không kéo bong bóng biến mất): bong bóng tròn góc dưới phải ở **mọi trang**, chấm đỏ số tin chưa đọc (so `lastId` với id đã xem lưu `localStorage["okia-chat-seen"]`; lần đầu vào trang coi như đã xem hết), viên số người online dưới bong bóng. Ở màn đang chơi (`/play`, `/r/…`) bong bóng thu nhỏ 44 px, không viên online, khung đang mở tự đóng.
- Khung chat: tiêu đề + online, phóng to / thu nhỏ (PC), đóng (Esc). Tin gộp nhóm khi cùng người trong 2 phút; tin của mình nền vàng; nút trả lời hiện khi rê chuột (điện thoại luôn hiện mờ). Cuộn lên đầu tự tải tin cũ, giữ nguyên chỗ đang đọc. Enter gửi, Shift+Enter xuống dòng, bỏ qua Enter khi bộ gõ tiếng Việt đang ghép chữ.
- Ô "Đang tìm trận" (SearchPill) nằm bên trái bong bóng; footer chừa khoảng trống đáy để bong bóng không che link.
- Store `web/src/stores/chat.ts`.

## Kiểm thử

- `api/tests/test_chat.py`: quyền, giới hạn tốc độ / chống lặp, trả lời, phân trang, phát WS chỉ cho người đang xem.
- `pnpm smoke:chat` (web 3000 + api 8000): khách chỉ đọc, hai tài khoản chat trực tiếp, trả lời trích dẫn, gửi quá nhanh, tin chưa đọc, không có bong bóng ở màn chơi.
