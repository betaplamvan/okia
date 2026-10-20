# 04 — Giao thức WebSocket

Một kết nối WS duy nhất mỗi tab: `wss://<domain>/ws?token=<JWT>&lang=vi|en`. Ngôn ngữ dùng cho `error.message`, `bot_say`, `match_review`; ưu tiên `users.locale` nếu có (xem [11](11-responsive-i18n.md#xác-định-ngôn-ngữ)). Mọi tin nhắn là JSON có trường `t` (type). Schema định nghĩa bằng Pydantic ở `api/app/ws/messages.py`, xuất JSON Schema để sinh type TypeScript cho `web/`.

## Client → Server

| `t` | Trường | Ý nghĩa |
|---|---|---|
| `queue` | `mode: "casual"\|"ranked"`, `board?: <id map>\|"random"` | Vào hàng chờ ghép trận. Xếp hạng luôn bốc map ngẫu nhiên (bỏ qua `board`) |
| `queue_cancel` | — | Rời hàng chờ |
| `room_create` | `board: <id map>\|"random"`, `turnSeconds: 15\|30\|60\|null`, `showLastMove: bool` (mặc định `true`) | Tạo phòng riêng, nhận mã phòng. Server chốt map (`random` → bốc trong bể); id lạ → `INVALID_BOARD` |
| `room_join` | `roomId` | Vào phòng (từ link mời hoặc kết nối lại). Mã phòng 6 ký tự (A–Z, 2–9, bỏ I/O/0/1), không phân biệt hoa thường |
| `room_leave` | `roomId` | Rời phòng đang chờ (xóa phòng) hoặc phòng đã kết thúc |
| `move` | `roomId`, `edge`, `seq` | Vẽ cạnh. `seq` = `moveNo` client đang thấy |
| `resign` | `roomId` | Đầu hàng |
| `emote` | `roomId`, `id` | Biểu cảm nhanh (danh sách cố định, không chat tự do) |
| `ping` | — | Giữ kết nối, mỗi 20 giây |

## Server → Client

| `t` | Trường | Ý nghĩa |
|---|---|---|
| `welcome` | `userId`, `activeRoomId?` | Sau khi kết nối; có `activeRoomId` nếu đang dở trận → client gửi `room_join` |
| `queued` | `mode`, `board`, `since` | Đã vào hàng chờ |
| `matched` | `roomId` | Tìm được đối thủ → client gửi `room_join` |
| `room_state` | `roomId`, `mode`, `board` (id map đã chốt), `turnSeconds`, `showLastMove`, `status: waiting\|playing\|over`, `hostId`, `players[]`, `state`, `deadline`, `result?`, `loadouts` | Ảnh chụp đầy đủ trạng thái (khi vào phòng / kết nối lại; khi người thứ hai vào, cả hai cùng nhận) |
| `moved` | `roomId`, `by`, `edge`, `captured[]`, `scores`, `turn`, `moveNo`, `deadline`, `reason: "player"\|"timeout"` | Một nước đi đã được chấp nhận |
| `game_over` | `roomId`, `winner: 0\|1\|null`, `scores`, `reason: "complete"\|"resign"\|"afk"`, `ratingDelta?`, `rewards?` | Kết thúc ván |
| `opponent_status` | `roomId`, `online: bool` | Đối thủ rớt mạng / quay lại |
| `emote` | `roomId`, `by`, `id` | Biểu cảm của đối thủ |
| `bot_say` | `roomId`, `text`, `event` | Lời thoại của bot (LLM hoặc câu soạn sẵn), hiện dạng bong bóng |
| `match_review` | `matchId`, `text`, `keyMove?` | Nhận xét sau ván với bot; `keyMove` = số thứ tự nước sai quan trọng nhất để client tô sáng |
| `error` | `code`, `message`, `ref?` | Lỗi; `code` ổn định để client tự dịch, `message` đã dịch theo locale; `ref` gắn với tin nhắn gây lỗi |
| `pong` | — | |

`players[]` gồm `{ userId, name, tier, isBot, seat: 0|1, online }`. Chủ phòng ngồi ghế 0 hoặc 1 ngẫu nhiên khi ván bắt đầu. `welcome` có thêm `serverTime` (epoch ms). `deadline` là epoch ms theo giờ server; client tự bù lệch giờ từ `welcome`.

## Luồng một nước đi

1. Client gửi `move` với `seq = moveNo` hiện tại.
2. Server lấy khóa phòng, kiểm tra `seq == moveNo` (chống gửi trùng/cũ), gọi `rules.apply_move`.
3. Ghi trạng thái mới vào Redis, publish `moved` lên kênh `room:{id}`.
4. Mọi worker đang giữ kết nối của phòng đó đẩy `moved` cho client.
5. Client **có thể animate lạc quan** ngay khi bấm, nhưng nếu nhận `error` thì hoàn tác và đồng bộ lại bằng `room_state`.

## Mã lỗi

| `code` | Khi nào |
|---|---|
| `UNAUTHORIZED` | Token sai/hết hạn (client refresh rồi kết nối lại) |
| `GUEST_NOT_ALLOWED`, `EMAIL_NOT_VERIFIED` | Khách hoặc tài khoản chưa xác minh gửi `queue` với `mode: "ranked"` |
| `NOT_YOUR_TURN`, `INVALID_EDGE`, `EDGE_TAKEN`, `GAME_OVER` | Từ luật chơi |
| `STALE_SEQ` | `seq` không khớp — client cần đồng bộ lại |
| `ROOM_NOT_FOUND`, `ROOM_FULL` | Phòng không tồn tại / đã đủ người |
| `ALREADY_IN_GAME` | Đang ở trận khác |
| `RATE_LIMITED` | Gửi quá nhanh |
| `ROOM_BUSY` | Không lấy được khóa phòng sau ~2 giây |
| `BAD_MESSAGE` | JSON không đúng schema |
| `INVALID_BOARD` | `room_create` với id map không có trong bể (hoặc map ẩn ở production) |
| `UNSUPPORTED` | Tính năng chưa có (`queue` ở giai đoạn 1) |

**Triển khai (M1.4–M1.7):** model Pydantic ở `api/app/ws/messages.py`; `uv run python -m scripts.export_ws_schema` xuất `shared/ws-schema.json`; `pnpm gen:ws` sinh `web/src/game/ws-types.ts`. Token sai → đóng với code **4401** trước khi accept; client refresh rồi nối lại. Presence: hash `presence:{room}` đếm số kết nối mỗi user; về 0 → `opponent_status(false)`. Khi socket đóng, phần dọn dẹp chạy trong task được shield để server tắt handler cũng không mất `opponent_status`.

## Kết nối lại

- Server lưu `user:{id}:room` (TTL bằng thời gian còn lại của trận + 5 phút).
- Khi WS kết nối lại, `welcome.activeRoomId` có giá trị → client tự `room_join` → nhận `room_state` đầy đủ.
- Trong lúc mất kết nối, timer vẫn chạy theo [luật hết giờ](03-luat-choi.md#timer--bỏ-lượt-chỉ-chế-độ-online).
