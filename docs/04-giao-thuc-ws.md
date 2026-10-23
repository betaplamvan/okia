# 04 — Giao thức WebSocket

Một kết nối WS duy nhất mỗi tab: `wss://<domain>/ws?token=<JWT>&lang=vi|en`. Ngôn ngữ dùng cho `error.message`, `bot_say`, `match_review`; ưu tiên `users.locale` nếu có (xem [11](11-responsive-i18n.md#xác-định-ngôn-ngữ)). Mọi tin nhắn là JSON có trường `t` (type). Schema định nghĩa bằng Pydantic ở `api/app/ws/messages.py`, xuất JSON Schema để sinh type TypeScript cho `web/`.

## Client → Server

| `t` | Trường | Ý nghĩa |
|---|---|---|
| `queue` | `mode: "casual"\|"ranked"`, `board?: <id map>\|"random"` | Vào hàng chờ ghép trận (gửi lại = idempotent, giữ thời điểm vào). Xếp hạng luôn bốc map ngẫu nhiên (bỏ qua `board`); `casual` còn trả `UNSUPPORTED` (P2-06) |
| `queue_cancel` | — | Rời hàng chờ (đang có trận chờ chấp nhận thì = từ chối) |
| `match_accept` | `matchId` | Chấp nhận trận vừa ghép (trong hạn `match_found.expiresAt`) |
| `match_decline` | `matchId` | Từ chối trận vừa ghép → rời hàng chờ |
| `room_create` | `board: <id map>\|"random"`, `turnSeconds: 15\|30\|60\|null`, `showLastMove: bool` (mặc định `true`) | Tạo phòng riêng, nhận mã phòng. Server chốt map (`random` → bốc trong bể); id lạ → `INVALID_BOARD` |
| `room_join` | `roomId` | Vào phòng (từ link mời hoặc kết nối lại). Mã phòng 6 ký tự (A–Z, 2–9, bỏ I/O/0/1), không phân biệt hoa thường |
| `room_leave` | `roomId` | Rời phòng đang chờ (xóa phòng) hoặc phòng đã kết thúc |
| `move` | `roomId`, `edge`, `seq` | Vẽ cạnh. `seq` = `moveNo` client đang thấy |
| `resign` | `roomId` | Đầu hàng |
| `emote` | `roomId`, `id` | Biểu cảm nhanh — `id` trong danh sách cố định `EMOTES` (messages.py); sai → `BAD_MESSAGE`; 1 lần / 2 giây ([08](08-skin.md#đồ-ném--biểu-cảm-trong-trận-2026-10-24)) |
| `throw` | `roomId`, `id` | Ném đồ: `id` = skin loại throw mình sở hữu (`UNKNOWN_ITEM` / `NOT_OWNED`); chung giới hạn với emote |
| `ping` | — | Giữ kết nối, mỗi 20 giây |
| `chat_watch` / `chat_unwatch` | — | Mở / đóng khung chat tổng → bắt đầu / ngừng nhận `chat_msg` ([15](15-chat.md)) |

## Server → Client

| `t` | Trường | Ý nghĩa |
|---|---|---|
| `welcome` | `userId`, `activeRoomId?` | Sau khi kết nối; có `activeRoomId` nếu đang dở trận → client gửi `room_join` |
| `queued` | `mode`, `board`, `since` | Đã vào hàng chờ |
| `queue_status` | `mode`, `waiting`, `online`, `since`, `widened` | Worker gửi mỗi giây cho người đang chờ: số người chờ, số online, đã mở hết cửa sổ (trận lệch chỉ ±1) |
| `match_found` | `matchId`, `mode`, `expiresAt`, `acceptSeconds` | Đã ghép được đối thủ, cả hai có 20 giây để `match_accept` (client hiện vòng đếm ngược) |
| `match_update` | `matchId`, `accepted` | Số người đã chấp nhận thay đổi ("đối thủ đã sẵn sàng") |
| `match_cancelled` | `matchId`, `reason: declined\|timeout\|left`, `byMe`, `requeued` | Trận chờ bị hủy; `requeued = true` → server đã trả về hàng chờ với thời điểm xếp hàng cũ và gửi `queued` ngay sau |
| `matched` | `roomId`, `mode` | Cả hai đã chấp nhận → phòng mở (gửi qua kênh `user:{id}`) → client vào `/r/{roomId}` và gửi `room_join`. Phòng xếp hạng ở trạng thái `playing` ngay |
| `room_state` | `roomId`, `mode`, `board` (id map đã chốt), `turnSeconds`, `showLastMove`, `status: waiting\|playing\|over`, `hostId`, `players[]`, `state`, `deadline`, `result?`, `loadouts` | Ảnh chụp đầy đủ trạng thái (khi vào phòng / kết nối lại; khi người thứ hai vào, cả hai cùng nhận) |
| `moved` | `roomId`, `by`, `edge`, `captured[]`, `scores`, `turn`, `moveNo`, `deadline`, `reason: "player"\|"timeout"` | Một nước đi đã được chấp nhận |
| `game_over` | `roomId`, `winner: 0\|1\|null`, `scores`, `reason: "complete"\|"resign"\|"afk"`, `ranked?` | Kết thúc ván. Trận xếp hạng: `ranked = { points[], pointsDelta[], ranks[], rewards[], placementLeft[] }` theo ghế (null nếu server không chốt được) |
| `opponent_status` | `roomId`, `online: bool` | Đối thủ rớt mạng / quay lại |
| `emote` | `roomId`, `by`, `id` | Biểu cảm — dội cho CẢ HAI ghế (kể cả người gửi) |
| `throw_out` | `roomId`, `by`, `id` | Đồ ném — dội cho cả hai ghế; client vẽ món bay từ chip `by` sang chip kia |
| `bot_say` | `roomId`, `text`, `event` | Lời thoại của bot (LLM hoặc câu soạn sẵn), hiện dạng bong bóng |
| `match_review` | `matchId`, `text`, `keyMove?` | Nhận xét sau ván với bot; `keyMove` = số thứ tự nước sai quan trọng nhất để client tô sáng |
| `error` | `code`, `message`, `ref?` | Lỗi; `code` ổn định để client tự dịch, `message` đã dịch theo locale; `ref` gắn với tin nhắn gây lỗi |
| `pong` | — | |
| `chat_msg` | `message` | Tin chat tổng mới (kênh Redis `chat:all`, chỉ tới kết nối đang `chat_watch`); gửi tin qua REST `POST /chat/messages` ([15](15-chat.md)) |

`players[]` gồm `{ userId, name, avatarUrl, rank: { tier, division, points } | null, isBot, seat: 0|1, online }` (`rank` chỉ ở phòng xếp hạng; null = đang phân hạng). Chủ phòng ngồi ghế 0 hoặc 1 ngẫu nhiên khi ván bắt đầu. `welcome` có thêm `serverTime` (epoch ms). `deadline` là epoch ms theo giờ server; client tự bù lệch giờ từ `welcome`.

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
| `ALREADY_IN_GAME` (ref `queue`) | Đang dở trận mà gửi `queue` — client về phòng cũ |
| `MATCH_PENDING` | Đang có trận chờ chấp nhận mà gửi `queue` |
| `MATCH_EXPIRED` | `match_accept` / `match_decline` khi trận chờ không còn (đã hủy hoặc đã mở phòng) |
| `NOT_YOUR_TURN`, `INVALID_EDGE`, `EDGE_TAKEN`, `GAME_OVER` | Từ luật chơi |
| `STALE_SEQ` | `seq` không khớp — client cần đồng bộ lại |
| `ROOM_NOT_FOUND`, `ROOM_FULL` | Phòng không tồn tại / đã đủ người |
| `ALREADY_IN_GAME` | Đang ở trận khác |
| `RATE_LIMITED` | Gửi quá nhanh |
| `ROOM_BUSY` | Không lấy được khóa phòng sau ~2 giây |
| `BAD_MESSAGE` | JSON không đúng schema |
| `INVALID_BOARD` | `room_create` với id map không có trong bể (hoặc map ẩn ở production) |
| `UNSUPPORTED` | Tính năng chưa có (`queue` với `mode: "casual"`) |
| `UNKNOWN_ITEM`, `NOT_OWNED` | `throw` với id không phải đồ ném / chưa mua |
| `GAME_OVER` (ref `emote`/`throw`) | Ván đã kết thúc, không còn tương tác |

**Triển khai (M1.4–M1.7):** model Pydantic ở `api/app/ws/messages.py`; `uv run python -m scripts.export_ws_schema` xuất `shared/ws-schema.json`; `pnpm gen:ws` sinh `web/src/game/ws-types.ts`. Token sai → đóng với code **4401** trước khi accept; client refresh rồi nối lại. Presence: hash `presence:{room}` đếm số kết nối mỗi user; về 0 → `opponent_status(false)`. Khi socket đóng, phần dọn dẹp chạy trong task được shield để server tắt handler cũng không mất `opponent_status`.

## Giới hạn (chống lạm dụng, 2026-10-21)

Tính trên **mỗi tiến trình uvicorn** (`WEB_CONCURRENCY=2` trên production → nhân đôi), cấu hình qua
`app/config.py` (`WS_MAX_CONN_PER_USER` 4, `WS_MAX_CONN_PER_IP` 40, `WS_MSG_PER_SECOND` 20,
`WS_MSG_BURST` 40, `WS_MAX_MSG_BYTES` 16 KB; uvicorn `--ws-max-size 65536` chặn frame lớn ở tầng giao thức).

| Mã đóng | Khi nào | Client nên |
|---|---|---|
| `4401` | Token sai / hết hạn / đã thu hồi | Refresh token rồi nối lại (0,3 s) |
| `4409` | Tài khoản vừa đăng nhập nơi khác ([13](13-xac-thuc.md#một-phiên-mỗi-tài-khoản)); server đá mọi kết nối của tài khoản qua kênh Redis `kick:{user_id}` | Refresh rồi nối lại (0,3 s). Cùng trình duyệt thì cookie mới vẫn dùng được; khác nơi thì refresh trả `SESSION_REPLACED` → về khách + báo |
| `4429` | Quá số kết nối cho phép của tài khoản hoặc IP | Không nối lại ngay; đóng tab thừa |
| `4430` | Gửi tin quá dày (token bucket 20 tin/giây, cộng dồn tối đa 40) hoặc tin > 16 KB | Nối lại theo backoff thường |

IP thật lấy từ `CF-Connecting-IP` (Cloudflare đặt, client không giả được), không qua Cloudflare thì
`X-Forwarded-For`. Kết nối từ loopback (script đo tải `api/scripts/ws_load.py` chạy trên máy; cổng API chỉ
bind 127.0.0.1) được miễn giới hạn số kết nối.

**Cache đường nối** (`app/auth/ws_cache.py`): `token_version`, `locale`, `display_name` giữ ở Redis
`wsu:{user_id}` TTL 5 phút; mọi chỗ đổi ba trường này (đăng xuất mọi thiết bị, sửa hồ sơ, xóa tài khoản,
cấp token mới, bỏ khách khi gộp) xóa cache. Trước đó mỗi kết nối tra Postgres — 300 kết nối cùng lúc làm
welcome p50 2 s.

## Kết nối lại

- Server lưu `user:{id}:room` (TTL bằng thời gian còn lại của trận + 5 phút).
- Khi WS kết nối lại, `welcome.activeRoomId` có giá trị → client tự `room_join` → nhận `room_state` đầy đủ.
- Trong lúc mất kết nối, timer vẫn chạy theo [luật hết giờ](03-luat-choi.md#timer--bỏ-lượt-chỉ-chế-độ-online).
