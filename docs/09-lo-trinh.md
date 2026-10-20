# 09 — Lộ trình phát triển

## Cách chia việc

- **Giai đoạn** → **Mốc (milestone)** → **Việc (task)**.
- Mỗi **việc** ≤ **1 buổi** (~3 giờ). Việc lớn hơn thì tách tiếp.
- Mỗi **mốc** kết thúc bằng một thứ **chạy được, demo được** — không có mốc nào "chỉ viết code nền".
- Chỉ sang giai đoạn sau khi đạt **tiêu chí hoàn thành** của giai đoạn trước.
- Đánh dấu `[x]` khi xong. Ước lượng tính theo buổi; giả định ~4 buổi/tuần.
- **Áp dụng cho mọi việc có giao diện:** chuỗi hiển thị đi qua i18n (đủ `vi` và `en`), kiểm tra ở chiều rộng 360px và desktop (xem [11](11-responsive-i18n.md)).
- **Áp dụng cho mọi việc đổi schema:** theo [quy trình Alembic](05-co-so-du-lieu.md#quản-lý-schema-bằng-alembic).

| Giai đoạn | Mục tiêu | Ước lượng |
|---|---|---|
| [0. Prototype offline](#giai-đoạn-0--prototype-offline) | Chơi được với bot trên trình duyệt, hai ngôn ngữ, mọi kích thước màn hình | ~20 buổi (~5 tuần) |
| [1. Online phòng riêng](#giai-đoạn-1--online-phòng-riêng) | Hai người ở hai nơi chơi với nhau qua link; tài khoản email/Google | ~23 buổi (~6 tuần) |
| [2A. Ghép trận & xếp hạng](#giai-đoạn-2a--ghép-trận--xếp-hạng) | Người lạ ghép trận, có hạng và BXH | ~14 buổi (~3,5 tuần) |
| [2B. Kinh tế & skin](#giai-đoạn-2b--kinh-tế--skin) | Kiếm Ruột chì từ xếp hạng, mua và trang bị skin → **Beta công khai** | ~18 buổi (~4,5 tuần) |
| [3. Lan truyền & vận hành](#giai-đoạn-3--lan-truyền--vận-hành) | Bảo mật tài khoản nâng cao, sự kiện, admin, bot có cá tính | liên tục |
| [4. Donate & duy trì](#giai-đoạn-4--donate--duy-trì) | Trang ủng hộ, minh bạch chi phí | ~3 buổi, sau beta |

---

## Giai đoạn 0 — Prototype offline

Chỉ có `web/`, chưa có backend. Mục đích: kiểm chứng cảm giác "đã tay".

### M0.1 Khởi tạo dự án
- [x] **P0-01** Tạo Next.js + TypeScript trong `web/`; Chakra UI v3 (provider, theme, color mode); ESLint, Prettier; cài PixiJS, GSAP, Howler, Zustand
- [x] **P0-02** Cài Vitest; tạo cấu trúc thư mục theo [02](02-kien-truc.md#cấu-trúc-repo); khởi tạo git, `.gitignore`
- [x] **P0-03** i18n: `next-intl`, route `app/[locale]/` (vi không tiền tố, en có `/en`), `messages/vi.json` + `en.json`, nút đổi ngôn ngữ, script kiểm tra hai file có cùng tập key
- [ ] **P0-04** Khung giao diện responsive: layout mobile-first, `100dvh`, safe-area; chọn font UI và font viết tay (script kiểm tra đủ dấu tiếng Việt, xem [12](12-asset.md#font)); trang chủ tạm

✅ *Demo: trang chủ đổi được vi/en, hiển thị đúng ở 320px và desktop.*

### M0.2 Luật chơi
- [ ] **P0-05** `rules.ts`: kiểu dữ liệu, hàm đánh số cạnh/ô, `createGame`, `applyMove` theo [03](03-luat-choi.md)
- [ ] **P0-06** Viết fixtures trong `shared/fixtures/` (đủ các nhóm tối thiểu) + test Vitest đọc fixtures

✅ *Demo: `pnpm test` xanh với toàn bộ fixtures.*

### M0.3 Vẽ bàn đấu
- [ ] **P0-07** Mount PixiJS ở `/play` (client component); `ResizeObserver`, `resolution = min(dpr, 2)`, `touch-action: none`
- [ ] **P0-08** Vẽ bàn mặc định "vở ô li": nền, lưới mờ, chấm; bàn luôn vuông, tự co theo khung
- [ ] **P0-09** Bắt cạnh gần điểm chạm nhất (không vùng chết), hiện cạnh mờ khi hover; chế độ chạm hai lần cho bàn 7×7 trên màn hình < 400px
- [ ] **P0-10** Vẽ cạnh đã đi (màu theo người chơi) và ô đã ăn (tô đơn giản)

### M0.4 Vòng lặp chơi với bot tạm
- [ ] **P0-11** Interface `GameController` (để sau này thay bằng bản online); `LocalBotController`: người chơi click → `applyMove` → renderer; **bot tạm** (ăn ô nếu có, còn lại ngẫu nhiên) đi với độ trễ tự nhiên
- [ ] **P0-12** HUD theo bố cục dọc/ngang ở [11](11-responsive-i18n.md#bố-cục-màn-hình-chơi): tên, điểm, lượt; màn hình kết thúc; chơi lại; chọn bàn 3×3 / 5×5 / 7×7

✅ *Demo: chơi hết ván với bot tạm trên điện thoại, xoay màn hình không mất ván.*

### M0.5 Animation
- [ ] **P0-13** Nét vẽ chạy từ chấm đến chấm (GSAP), hiệu ứng ăn ô gạch chéo + nảy nhẹ
- [ ] **P0-14** Chữ "COMBO ×n" (qua hàm `t` truyền vào engine), particle giấy, đếm ô cuối ván; tôn trọng `prefers-reduced-motion`

### M0.6 Âm thanh
- [ ] **P0-15** `AudioManager` (Howler, audio sprite) với âm thanh tạm (tổng hợp bằng script hoặc CC0, ghi `credits.md`); script build audio sprite; mở khóa audio iOS ở lần chạm đầu
- [ ] **P0-16** Cao độ tăng dần khi ăn chuỗi, rung nhẹ; cài đặt âm lượng lưu `localStorage`

✅ *Demo: ván chơi có đủ hình và tiếng — đây là lúc tự hỏi "có đã tay không?"*

### M0.7 Bot
- [ ] **P0-17** `bot.ts` theo [03 — Bot](03-luat-choi.md#bot): ăn ô, cạnh an toàn, nhường chuỗi ngắn nhất; tham số `strength` + lỗi có chủ đích; fixtures tình huống cho bot
- [ ] **P0-18** Luật chuỗi dài, double-cross, tìm kiếm alpha-beta cuối ván — *có thể để sau giai đoạn 1 nếu tốn thời gian*

### M0.8 Hoàn thiện & cho bạn bè thử
- [ ] **P0-19** Hoàn thiện trang chủ/menu; kiểm tra trên iOS Safari + Chrome Android thật, đủ các kích thước ở [11](11-responsive-i18n.md#kiểm-thử), cả hai ngôn ngữ
- [ ] **P0-20** Deploy bản tĩnh (VPS hoặc Vercel preview), gửi 5–10 người chơi thử, ghi lại phản hồi

**🏁 Tiêu chí hoàn thành giai đoạn 0:** người lạ mở link trên điện thoại, chơi hết ván với bot mà không cần hướng dẫn, ở cả hai ngôn ngữ; phản hồi về cảm giác chơi là tích cực.

---

## Giai đoạn 1 — Online phòng riêng

### M1.1 Khởi tạo backend
- [ ] **P1-01** `api/` FastAPI: cấu hình settings, healthcheck, pytest; `docker-compose.yml` với Postgres + Redis cho dev
- [ ] **P1-02** SQLAlchemy async + Alembic: `naming_convention`, `env.py` async, `alembic check` trong CI; model + migration đầu tiên (`users`, `auth_identities`, `sessions`, `matches` theo [05](05-co-so-du-lieu.md#tài-khoản))
- [ ] **P1-03** i18n backend: `t(key, locale)`, `locales/vi.json` + `en.json`, xác định locale (`users.locale` → `Accept-Language` → `vi`), test hai file cùng tập key; lỗi trả `code` + `message` đã dịch

### M1.2 Luật chơi phía server
- [ ] **P1-04** `rules.py` port từ `rules.ts`; pytest chạy trên cùng `shared/fixtures/`; CI chạy cả Vitest và pytest

✅ *Demo: hai bộ test cùng xanh trên một bộ fixtures.*

### M1.3 Xác thực (theo [13](13-xac-thuc.md))
- [ ] **P1-05** Phiên: access JWT 1 giờ + refresh cookie xoay (`sessions`), `token_version`; đăng nhập khách (device id); `GET /me`, `PATCH /me` (tên hiển thị, `locale`); client đồng bộ ngôn ngữ đã chọn
- [ ] **P1-06** Email + mật khẩu: `register` (Argon2id, danh sách mật khẩu phổ biến), `login` (rate limit, lỗi không phân biệt), nâng cấp khách → tài khoản; test
- [ ] **P1-07** Email giao dịch (Resend qua background task + Mailpit dev, mẫu vi/en): xác minh email, quên/đặt lại mật khẩu (token một lần, tăng `token_version`); webhook bounce; chặn xếp hạng khi chưa xác minh
- [ ] **P1-08** Google OAuth (PKCE, xác minh `id_token`), tự liên kết theo email đã xác minh, gộp tài khoản khách, xử lý `IDENTITY_TAKEN`; test
- [ ] **P1-09** Giao diện: màn hình đăng nhập/đăng ký/quên mật khẩu, banner "xác minh email", trang cài đặt tài khoản tối thiểu; `DELETE /me` xóa mềm

✅ *Demo: khách chơi → đăng ký email → nhận mail xác minh (Mailpit) → bấm link → được vào xếp hạng; đăng nhập Google trùng email tự liên kết.*

### M1.4 Nền WebSocket
- [ ] **P1-10** Endpoint `/ws` xác thực JWT, nhận `lang`, `ping/pong`, gửi `error`; model Pydantic cho các tin nhắn theo [04](04-giao-thuc-ws.md)
- [ ] **P1-11** Script xuất JSON Schema → sinh type TS vào `web/`; Redis pub/sub helper

### M1.5 Phòng đấu
- [ ] **P1-12** `room_create` / `room_join`, lưu `room:{id}` trong Redis, gửi `room_state`
- [ ] **P1-13** Xử lý `move`: khóa phòng, kiểm tra `seq`, `apply_move`, publish `moved`
- [ ] **P1-14** `resign`, `game_over`, ghi trận vào bảng `matches`, dọn Redis

### M1.6 Timer & kết nối lại
- [ ] **P1-15** Sorted set `deadlines` + worker quét mỗi giây (có khóa); hết giờ đi ngẫu nhiên; 3 lần → `afk`
- [ ] **P1-16** `user:{id}:room`, `welcome.activeRoomId`, `opponent_status`

✅ *Demo: test tích hợp với 2 client WS giả chơi hết ván, kể cả rớt mạng giữa chừng.*

### M1.7 Client online
- [ ] **P1-17** WS client có tự kết nối lại (backoff) và tự refresh access token, store trạng thái kết nối
- [ ] **P1-18** `NetworkController` (cùng interface `GameController`): animate lạc quan, hoàn tác khi lỗi; hiển thị lỗi theo `code` đã dịch
- [ ] **P1-19** Màn hình tạo phòng, trang mời `/r/[id]`, nút chia sẻ (Web Share API), ảnh OG theo ngôn ngữ khi dán link vào Zalo/Messenger
- [ ] **P1-20** Thanh đếm giờ lượt, báo đối thủ rớt mạng, màn hình kết thúc online

### M1.8 Triển khai
- [ ] **P1-21** VPS + Docker Compose production (container `api` chạy `alembic upgrade head` khi khởi động), Caddy, Cloudflare, tên miền; cấu hình SPF/DKIM cho email
- [ ] **P1-22** Backup `pg_dump` → R2, Sentry cho web và api, trang chính sách quyền riêng tư (vi/en)
- [ ] **P1-23** Test ảnh chụp màn hình Playwright: 3 kích thước × 2 ngôn ngữ cho trang chủ, đăng nhập, màn chơi, màn kết thúc

**🏁 Tiêu chí hoàn thành giai đoạn 1:** hai điện thoại ở hai mạng khác nhau chơi hết ván qua link mời; tắt mạng 20 giây rồi bật lại vẫn chơi tiếp được; mỗi người thấy giao diện theo ngôn ngữ của mình; đăng ký email thật nhận được mail xác minh trên production.

---

## Giai đoạn 2A — Ghép trận & xếp hạng

### M2.1 Hệ thống điểm
- [ ] **P2-01** Model + migration `seasons` (tên `{vi, en}`), `ratings`; `glicko2.py` + test với ví dụ của Glickman
- [ ] **P2-02** Tính hạng/bậc từ điểm hiển thị, trận phân hạng; cập nhật rating khi `game_over` (trong transaction)

### M2.2 Ghép trận
- [ ] **P2-03** `queue` / `queue_cancel`, hàng chờ sorted set, worker ghép trận với cửa sổ MMR nới dần
- [ ] **P2-04** Tách casual / ranked, chặn tài khoản khách khỏi ranked, chống ghép lại đối thủ vừa gặp; test

### M2.3 Bot phía server
- [ ] **P2-05** Port bot sang `bot.py` (dùng chung fixtures tình huống của bot); tự điều chỉnh `strength` theo MMR và chuỗi thắng/thua
- [ ] **P2-06** "Chơi với máy" chuyển sang chạy qua phòng ở server (có thưởng); `bot.ts` chỉ còn là dự phòng khi mất mạng; đề nghị chơi với bot sau 30 giây chờ ở casual

### M2.4 Giao diện xếp hạng
- [ ] **P2-07** Màn hình chờ ghép (thời gian chờ, số người online), huy hiệu hạng
- [ ] **P2-08** Hiện thay đổi điểm/hạng sau trận (có animation lên hạng)
- [ ] **P2-09** Trang BXH (SSR, cache Redis), trang hồ sơ + lịch sử trận

✅ *Demo: hai tài khoản bấm "Xếp hạng" và được ghép với nhau; BXH cập nhật sau trận.*

---

## Giai đoạn 2B — Kinh tế & skin

### M2.5 Ví & sổ cái
- [ ] **P2-10** Model + migration `wallets`, `wallet_ledger` (một loại tiền, xem [05](05-co-so-du-lieu.md#kinh-tế)); tạo ví khi tạo tài khoản
- [ ] **P2-11** Service `credit` / `debit` với idempotency theo [06](06-kinh-te.md#quy-tắc-ví); đủ bộ test bắt buộc

### M2.6 Thưởng
- [ ] **P2-12** Thưởng thắng trận xếp hạng khi `game_over` (cùng transaction với rating); không thưởng casual/bot/phòng riêng/afk/đầu hàng sớm; thông báo rõ ở màn hình chọn chế độ rằng chỉ xếp hạng mới cho Ruột chì
- [ ] **P2-13** Phát hiện dàn xếp kết quả: bảng `match_flags`, quy tắc cặp tài khoản gặp nhau bất thường, giữ thưởng/rating của trận bị cờ; test

### M2.7 Vật phẩm & trang bị
- [ ] **P2-14** Model + migration `items` (tên/mô tả `{vi, en}`, một cột `price`), `inventory`, `loadouts`; script seed từ `shared/skins/` (từ chối manifest thiếu ngôn ngữ); cấp skin mặc định cho người mới
- [ ] **P2-15** API mua (`purchase`: `debit` + `inventory` trong một transaction), trang bị (`PUT /loadout`); trả tên vật phẩm theo locale; gửi loadout trong `room_state`

### M2.8 Engine skin phía client
- [ ] **P2-16** Nạp manifest + asset theo nhu cầu, áp dụng bàn/bút/nét cho renderer
- [ ] **P2-17** Thư viện hiệu ứng ô (`hatch`, `fill`, `stamp`, `sticker`, `signature`); trang `/dev/skins` xem trước

### M2.9 Shop
- [ ] **P2-18** Trang shop responsive (lưới 2 cột trên điện thoại, nhiều cột trên desktop): danh mục, shop xoay vòng theo ngày, mua bằng Ruột chì, ví trên header
- [ ] **P2-19** Nút "Thử" trên bàn mẫu, luồng mua → đề nghị trang bị ngay; trang kho đồ & trang bị

### M2.10 Nội dung
- [ ] **P2-20** Pipeline `pnpm assets:build` đầy đủ (SVG → PNG, atlas, audio sprite, kiểm tra manifest) chạy trong CI
- [ ] **P2-21** 12 skin đầu tiên (3 mỗi loại, tên vi/en; ≥ 8 skin thuần thủ tục/SVG) + bộ âm thanh chính thức — *có thể làm song song từ giai đoạn 1*, xem [12](12-asset.md#lộ-trình-asset-song-song-với-09)

**🏁 Tiêu chí hoàn thành giai đoạn 2 (Beta công khai):** người chơi mới tạo tài khoản (email xác minh hoặc Google) → thắng trận xếp hạng → nhận Ruột chì → mua và trang bị skin → đối thủ nhìn thấy skin đó; thắng casual/bot/phòng riêng không sinh dòng ledger (đã có test chứng minh); trận bị cờ win-trading không trả thưởng.

---

## Giai đoạn 3 — Lan truyền & vận hành

Không có thứ tự cố định; chọn theo dữ liệu thực tế.

- [ ] **P3-01** Bảo mật tài khoản nâng cao: đổi mật khẩu, đổi email (xác minh địa chỉ mới), trang "Thiết bị đang đăng nhập" thu hồi từng phiên, gỡ/thêm identity Google
- [ ] **P3-02** Biểu cảm nhanh trong trận (`emote`)
- [ ] **P3-03** Job kết thúc mùa: reset mềm, phát thưởng theo `peak_tier`
- [ ] **P3-04** Trang admin tối giản: tra cứu người chơi, cấp vật phẩm, khóa tài khoản, xem xét `match_flags`, sửa nội dung `{vi, en}`
- [ ] **P3-05** PostHog: phễu chơi ván đầu, retention D1/D7 (tách theo ngôn ngữ)
- [ ] **P3-06** PWA (cài lên màn hình chính)
- [ ] **P3-07** Sự kiện theo mùa: khai giảng, 20/11, Tết — skin `reward` giới hạn thời gian
- [ ] **P3-08** Tìm hiểu Zalo Mini App (chính sách, khả năng đóng gói bản web)
- [ ] **P3-09** Giải đấu nhỏ cuối tuần

### M3.1 Cá tính bot bằng LLM (Qwen)
Theo [03 — Cá tính bot](03-luat-choi.md#cá-tính-bot-llm).
- [ ] **P3-10** `api/app/llm/client.py`: gọi server Qwen, timeout, hàng đợi bất đồng bộ; bộ câu soạn sẵn theo sự kiện (vi/en); bộ lọc từ ngữ; tắt hẳn khi `LLM_BASE_URL` trống
- [ ] **P3-11** Lời thoại theo sự kiện trong trận (`bot_say`) theo ngôn ngữ người chơi, giới hạn số câu mỗi trận; bong bóng thoại ở client + tùy chọn tắt
- [ ] **P3-12** Thuật toán tìm nước sai quan trọng nhất của người chơi
- [ ] **P3-13** Nhận xét sau ván (`match_review`): LLM diễn giải + client tô sáng nước sai trên bàn

---

## Giai đoạn 4 — Donate & duy trì

Không có thanh toán, không bán gì ([ADR-0005](adr/0005-mot-tien-te-donate.md)). Làm sau beta công khai, khi đã có người chơi thật.

- [ ] **P4-01** Trang `/donate` (vi/en): lời cảm ơn, VietQR + MoMo + một kênh quốc tế, cấu hình trong `web/src/config/donate.ts`; ghi rõ không có quyền lợi trong game ([10](10-phap-ly.md#donate))
- [ ] **P4-02** Phần minh bạch chi phí vận hành hằng tháng; danh sách cảm ơn tự đăng ký (tùy chọn)
- [ ] **P4-03** Lời mời donate ở màn hình kết thúc: tối đa một lần, sau ≥ 20 ván, tắt được
