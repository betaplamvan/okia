# 07 — Xếp hạng & ghép trận

Quyết định: [ADR-0012](adr/0012-diem-hang-hien-thi-tach-rating-an.md) — **hai con số tách biệt**: rating ẩn để ghép trận, điểm hạng hiển thị để leo. Code: `api/app/rating/` (Glicko-2, điểm hạng, mùa, chốt trận, REST), `api/app/matchmaking/` (hàng chờ, worker). **Đã làm 2026-10-21** (P2-01 → P2-04, P2-07 → P2-09, P2-12).

## Rating ẩn (Glicko-2)

- Mỗi người chơi mỗi mùa có `mmr` (khởi điểm 1500), `rd` (độ không chắc chắn, 350), `vol` (0.06). Hằng số hệ thống `τ = 0.5`. **Không bao giờ gửi cho client** — chỉ dùng để ghép trận và tính kỳ vọng thắng.
- Cập nhật **sau mỗi trận xếp hạng** (mỗi trận là một kỳ đánh giá). Kết quả: thắng 1, hòa 0.5, thua 0.
- `rd` tăng khi không chơi: trước khi tính trận mới, mỗi ngày nghỉ cộng `vol²` vào `φ²` (trần 350), nên người nghỉ lâu dịch chuyển nhanh hơn.
- Code: `api/app/rating/glicko2.py`, test so với ví dụ trong paper của Glickman (`tests/test_glicko2.py`).

## Điểm hạng hiển thị

Thứ người chơi nhìn thấy và leo (`ratings.points`, ≥ 0). Code: `api/app/rating/points.py`.

| Tình huống | Thắng | Thua |
|---|---|---|
| Trận cân sức (kỳ vọng 50/50, chênh rating ẩn ≤ 150) | **+24** | **−16** |
| Người được kỳ vọng thắng (E cao) | ít hơn, tối thiểu +1 | nhiều hơn, tối đa −30 |
| Người bị kỳ vọng thua (E thấp) | nhiều hơn, tối đa +40 | ít hơn, tối thiểu −1 |
| **Trận lệch trình độ** (ghép khi vắng người / chờ lâu) | tiền cược giảm: chênh ≥ 500 chỉ còn 10 % → người mạnh thắng **+1**, người yếu thua **−1** | |

**Không công bố công thức cho người chơi** (màn `/ranked` chỉ nói định tính: trận cân cộng nhiều hơn trừ; chênh lệch càng lớn điểm đổi càng ít). Công thức nội bộ: `thắng = round(24 × 2 × (1 − E) × s)`, `thua = −round(16 × 2 × E × s)`, với `E` = kỳ vọng thắng từ Glicko-2 và `s` = tiền cược: `1` khi chênh ≤ 150, giảm tuyến tính tới `0.1` khi chênh ≥ 500. Luôn ≥ 1 điểm về trị tuyệt đối; điểm không âm. Trận cân có lợi cho người thắng (+24/−16) để leo hạng có cảm giác tiến lên; trận lệch gần như không đổi điểm nên ghép lệch "chấp nhận được" mà không ai bị ép thua oan hay cày người yếu.

### Hạng & bậc

Tính thẳng từ điểm: mỗi hạng **300 điểm**, chia 3 bậc **III → II → I** (100 điểm mỗi bậc); Thủ khoa không có bậc.

| Hạng | Điểm | Màu huy hiệu |
|---|---|---|
| Giấy nháp | 0 – 299 | paper |
| Vở ô li | 300 – 599 | mint |
| Học sinh khá | 600 – 899 | sun |
| Học sinh giỏi | 900 – 1199 | pink |
| Thủ khoa | ≥ 1200 (hiện thứ hạng trên BXH) | coral |
| **Trạng nguyên** (danh hiệu) | Thủ khoa đứng **top 100** BXH — gán theo vị trí lúc trả kết quả (`points.with_top_title`), không phải ngưỡng điểm; rớt khỏi top 100 là mất | sun + vương miện |

Tên tiếng Anh: xem [bảng thuật ngữ](11-responsive-i18n.md#bảng-thuật-ngữ). **5 trận phân hạng** đầu mùa chưa hiện hạng (huy hiệu "Đang phân hạng", viền đứt); BXH chỉ tính người đã qua phân hạng. *Các con số là giá trị khởi điểm, chỉnh theo phân phối thực tế.*

## Mùa giải

- Dài **8 tuần**, tự mở khi mùa trước hết (`rating.service.current_season`, khóa advisory để không mở trùng); tên `Học kỳ n` / `Semester n`. Không cần job thủ công.
- **Reset mềm** khi người chơi vào mùa mới (tạo dòng rating lười từ mùa gần nhất): `mmr = 1500 + (mmr_cũ − 1500) × 0.5`, `rd = max(rd_cũ, 150)`, `điểm = điểm_cũ ÷ 2`.
- Thưởng cuối mùa theo `peak_tier` (vật phẩm `reward` + Ruột chì theo bảng ở [06](06-kinh-te.md#nguồn-giá-trị-khởi-điểm)): **chưa làm** (P3-03) — `ratings.peak_tier` đã được ghi để sau này phát.

## Ghép trận

Chỉ có xếp hạng (ghép trận thường là P2-06). Khách và tài khoản chưa xác minh bị từ chối ở `queue` (`GUEST_NOT_ALLOWED`, `EMAIL_NOT_VERIFIED`).

Worker nền (`api/app/matchmaking/worker.py`, một bản duy nhất nhờ `lock:mm`) chạy mỗi **1 giây** trên hàng chờ `mm:ranked` (zset score = rating ẩn) + `mm:ranked:info`:

1. Duyệt người chơi theo thời gian chờ giảm dần.
2. Cửa sổ rating ẩn: `window = 50 + 25 × ⌊chờ_giây / 5⌋`, tối đa **400** (đạt sau 70 giây); **sau 90 giây** ghép bất kỳ ai (vắng người thì vẫn có trận — điểm cược đã giảm theo bảng trên).
3. Ghép với người gần rating nhất nằm trong cửa sổ của mình **và** cửa sổ của họ.
4. Ưu tiên không ghép hai người vừa gặp nhau ở trận liền trước (`mm:last:{uid}`, 1 giờ) trong 15 giây đầu (`REMATCH_GRACE`) — có người khác hợp thì ghép người khác.
5. **Người thật luôn trước máy** (2026-10-23): ai chờ tới mốc ghép máy mà trong hàng còn người thật khác → ghép hai người với nhau (người gần mmr nhất), bỏ qua cửa sổ và luật tránh gặp lại (`queue.pair_stragglers`; điểm cược trận lệch tự giảm). Chỉ ai còn **một mình** mới được ghép máy. Lỗi trước đó: tránh gặp lại 60 giây > mốc ghép máy 45 giây → hai người vừa đấu xong tìm lại thì mỗi người gặp một máy dù chỉ có hai người.
6. Ghép xong: xóa cả hai khỏi hàng chờ, tạo **trận chờ chấp nhận** (`mm:pending:{id}`, hạn 20 giây) và gửi `match_found` qua kênh `user:{id}`; người còn chờ nhận `queue_status` mỗi giây (số người chờ, số online, đã mở rộng hay chưa).

### Chấp nhận trận (2026-10-21, kiểu LoL)

Client hiện hộp thoại với **vòng đếm ngược tròn** (giờ server), nút **Chơi luôn!** và **Từ chối**. Cả hai `match_accept` → tạo `room:{id}` (`mode = ranked`, map ngẫu nhiên, 30 giây/lượt, bắt đầu ngay) và gửi `matched`. Một người từ chối, hết giờ (worker quét `mm:pending` mỗi giây) hoặc rớt mạng → `match_cancelled` cho cả hai: người gây hủy rời hàng chờ; người kia được **trả về hàng chờ với thời điểm xếp hàng cũ** (không mất chỗ) và nhận `queued` mới. Người đã chấp nhận thấy "Đang chờ người chơi khác"; người chưa nhận thấy "Đối thủ đã sẵn sàng". Đang có trận chờ thì không xếp hàng lại được (`MATCH_PENDING`). Code: `api/app/matchmaking/pending.py`, `worker.accept/decline/cancel`, `web/src/components/ranked/accept-dialog.tsx`.

Ghi chấp nhận bằng Redis set `mm:pending:{id}:acc` (SADD nguyên tử, 2026-10-23): trước đó là đọc–sửa–ghi cả JSON trận chờ → hai người bấm **Chơi luôn** cùng lúc thì lượt ghi sau xóa mất lượt nhận của người kia, phòng không mở, 20 giây sau trận bị hủy "hết giờ" và người đã bấm bị coi là không nhận. Chỉ lượt chấp nhận cuối cùng (lượt vừa thêm người còn thiếu) mở phòng — bấm lặp không mở hai phòng.

Rớt mạng khi đang chờ → server bỏ khỏi hàng chờ; client tự gửi `queue` lại khi nối lại. **Tìm trận toàn cục** (2026-10-22): trạng thái tìm nằm trong `web/src/stores/matchmaking.ts` (zustand, lưu sessionStorage) chứ không trong trang /ranked — rời trang, tải lại vẫn tìm; `MatchmakingHost` (gắn trong AppShell) hiện **cửa sổ thu nhỏ** góc dưới phải ở mọi trang ngoài /ranked (spinner, thời gian đã chờ, nút Xem / hủy), bật **hộp chấp nhận** ở bất kỳ trang nào khi ghép được (người hay máy) và điều hướng vào phòng khi `matched`. Đang tìm thì **/play (chơi với máy) bị khóa** (`PlayGate`: hộp "Đang tìm trận xếp hạng" với nút hủy tìm) để ván với máy không bị cắt ngang khi ghép được. **Mục "ma"** (2026-10-22): API restart khi deploy hoặc rớt mạng không kịp đóng WS để lại mục trong Redis dù người đã đi; worker bỏ khỏi hàng chờ mọi mục không thấy ping quá 60 giây (`queue.purge_stale`, ping client mỗi 20 giây cập nhật `online`) trước khi ghép — trước đây người thật bị ghép với ma, chờ hộp chấp nhận 10 giây vô ích rồi mới được xếp lại và (đã chờ lâu) ghép máy ngay, trông như "ghép máy vẫn hiện đếm ngược chấp nhận".

### Ghép máy khi chờ lâu (2026-10-22)

Chờ quá `MM_BOT_AFTER_SECONDS` (mặc định 45 giây) mà không có ai hợp → worker bỏ người đó khỏi hàng chờ và tạo **trận chờ với máy** (`pending.create(bot_strength=…)`, `b` = Entry giả `BOT_ID`, máy đã chấp nhận sẵn; từ 2026-10-22 cũng qua vòng chấp nhận như người): client nhận `match_found` với `bot: true` + `match_update accepted=1`, hộp chấp nhận ghi "Đối thủ: Máy"; **Chơi luôn** → `worker.accept` mở phòng **người vs máy** (`room.create_vs_bot`) và gửi `matched`; **Từ chối** / hết giờ → rời hàng chờ như trận thường (máy không bao giờ xếp hàng, không nhận tin). Máy (`user_id = "bot"`, tên "Máy"/"Bot", `is_bot` trong `room_state.players`, luôn online, skin mặc định) đi qua task nền `botplay` sau mỗi nước của người (~0,9 giây ±40 %), bằng `app/game/bot.py` (bản Python của bot client, cùng fixtures). Độ mạnh theo **rating ẩn** (`bot.strength_for_rating`, thang 2026-10-26): MMR ≤ 1100 → 0,15 · 1500 → 0,35 · 1700 → 0,65 · ≥ 1900 → 0,95; rating chưa chắc (rd ≥ 200) kéo dần về 0,3, người mới hoàn toàn (rd 350) = 0,3 — người mới không gặp máy quá khó ([03](03-luat-choi.md#tự-điều-chỉnh-độ-mạnh)). Máy đi nước đầu thì chờ thêm ~2 giây (màn "Ai đi trước"). Không dùng bậc rank hiển thị vì điểm hạng tăng theo số ván (+24/−16), không phản ánh đúng trình độ. Chốt ván (`rating.settle_vs_bot`): điểm hạng cược **một nửa** trận cân (+12 / −8, hòa 0), thống kê games/wins/streak và thưởng 30 Ruột chì như thường, **rating ẩn không đổi**; `matches.player{0|1}` của máy = NULL, `bot_strength` ghi lại; lịch sử hiện đối thủ "Máy". Client: chip đối thủ icon máy + "Máy · điểm hạng ½". Hộp tìm trận **không hiện** số người chờ / online (trông nản khi ít người).

### Khi vắng người

| Chế độ | Chờ lâu |
|---|---|
| Ghép trận thường (P2-06) | Hỏi "Chơi với máy trong lúc chờ?" — bot tự chỉnh độ mạnh theo rating ẩn (xem [03 — Bot](03-luat-choi.md#bot)), **ghi rõ là máy** |
| Xếp hạng | Tiếp tục chờ, hiện số người online; sau 90 giây chấp nhận lệch trình độ, báo cho người chơi "trận lệch chỉ ±1 điểm" |

## Chốt trận (`rating.service.settle`)

Khi `game_over` của phòng xếp hạng, **một transaction Postgres**: khóa hai dòng `ratings` (theo thứ tự `user_id` cố định) → Glicko-2 + điểm hạng + thống kê (games/wins/losses/streak/peak) → cộng **30 Ruột chì** cho người thắng (idempotency `match:{id}:{uid}`; không thưởng khi `afk` hoặc đầu hàng trước nước 10, nhưng rating/điểm vẫn tính) → ghi `matches` với `season_id`, `rating_delta`, `points_delta`. Kết quả gửi trong `game_over.ranked` (điểm mới, ±, hạng, thưởng, số trận phân hạng còn lại). Lỗi DB → `ranked = null`, ván vẫn kết thúc, không ai mất/được điểm (ghi log).

## REST

| Endpoint | Trả về |
|---|---|
| `GET /seasons/current` | Mùa đang diễn ra |
| `GET /leaderboard?limit=100` | Top 100 theo điểm (cache Redis `lb:{season}` 30 giây) + dòng của tôi nếu có Bearer |
| `GET /me/rank` | Hạng, điểm, thống kê, vị trí BXH, 10 trận xếp hạng gần nhất |

Giao diện: `/ranked` (thẻ hạng + tìm trận, trạng thái chờ), `/leaderboard`, tab **Hạng** trong hồ sơ, huy hiệu hạng trên chip người chơi và hộp kết quả (± điểm, lên/rớt hạng, +Ruột chì). Smoke: `pnpm smoke:ranked`.

**Huy hiệu hạng** (`web/src/components/ranked/rank-emblem.tsx`, thiết kế duyệt 2026-10-21): một dáng khiên vở học trò viền mực, bóng cứng; mỗi bậc thêm một lớp — giấy xám nếp gấp (Giấy nháp), trang vở mint lề đỏ (Vở ô li), hai bút chéo + nơ (Học sinh khá), dấu 10 điểm + băng GIỎI + lá (Học sinh giỏi), mũ tốt nghiệp + nguyệt quế vàng + sao (Thủ khoa), mũ cánh chuồn + khiên xanh viền vàng + hào quang thở nhịp (Trạng nguyên). Bậc con = số sao dưới khiên (III → I); hai bậc đỉnh ghi `#thứ hạng`. Đang phân hạng = khiên giấy viền đứt, dấu hỏi. SVG inline tự rút gọn chi tiết: ≥ 64 px đủ đồ (thẻ hạng 112 px, hộp kết quả), 44 px trên BXH, 16–28 px trong pill `TierBadge` (chip trận). Lên hạng: khiên bật lên xoay nhẹ; rớt hạng: trượt xuống; hào quang tắt khi `prefers-reduced-motion`.

### Chống gian lận
- Server kiểm tra mọi nước đi (xem [03](03-luat-choi.md)).
- Rate limit `move` (tối đa 5 tin/giây).
- Không ghép lại đối thủ vừa gặp; trận lệch gần như không đổi điểm → cày tài khoản phụ không lời.
- Phát hiện **dàn xếp kết quả** (`match_flags`, P2-13): cặp tài khoản gặp nhau > 5 trận xếp hạng/ngày với kết quả một chiều → đánh dấu để xem xét — **chưa làm**.
- Tài khoản khách **không được chơi xếp hạng**; tài khoản phải **đã xác minh** (Google, [13](13-xac-thuc.md)).
