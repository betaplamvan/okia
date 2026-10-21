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
| [2B. Kinh tế & skin](#giai-đoạn-2b--kinh-tế--skin) | Ruột chì từ xếp hạng + thành tựu, EXP/cấp độ, rương sưu tầm, tủ trưng bày, shop → **Beta công khai** | ~26 buổi (~6,5 tuần) |
| [3. Lan truyền & vận hành](#giai-đoạn-3--lan-truyền--vận-hành) | Bảo mật tài khoản nâng cao, sự kiện, admin, bot có cá tính | liên tục |
| [4. Donate & duy trì](#giai-đoạn-4--donate--duy-trì) | Trang ủng hộ, minh bạch chi phí | ~3 buổi, sau beta |

---

## Giai đoạn 0 — Prototype offline

Chỉ có `web/`, chưa có backend. Mục đích: kiểm chứng cảm giác "đã tay".

### M0.1 Khởi tạo dự án
- [x] **P0-01** Tạo Next.js + TypeScript trong `web/`; Chakra UI v3 (provider, theme, color mode); ESLint, Prettier; cài PixiJS, GSAP, Howler, Zustand
- [x] **P0-02** Cài Vitest; tạo cấu trúc thư mục theo [02](02-kien-truc.md#cấu-trúc-repo); khởi tạo git, `.gitignore`
- [x] **P0-03** i18n: `next-intl`, route `app/[locale]/` (vi không tiền tố, en có `/en`), `messages/vi.json` + `en.json`, nút đổi ngôn ngữ, script kiểm tra hai file có cùng tập key
- [x] **P0-04** Khung giao diện responsive: layout mobile-first, `100dvh`, safe-area; chọn font UI và font viết tay (script kiểm tra đủ dấu tiếng Việt, xem [12](12-asset.md#font)); trang chủ tạm

✅ *Demo: trang chủ đổi được vi/en, hiển thị đúng ở 320px và desktop.*

### M0.2 Luật chơi
- [x] **P0-05** `rules.ts`: kiểu dữ liệu, hàm đánh số cạnh/ô, `createGame`, `applyMove` theo [03](03-luat-choi.md)
- [x] **P0-06** Viết fixtures trong `shared/fixtures/` (đủ các nhóm tối thiểu) + test Vitest đọc fixtures

✅ *Demo: `pnpm test` xanh với toàn bộ fixtures.*

### M0.3 Vẽ bàn đấu
- [x] **P0-07** Mount PixiJS ở `/play` (client component); `ResizeObserver`, `resolution = min(dpr, 2)`, `touch-action: none`
- [x] **P0-08** Vẽ bàn mặc định "vở ô li": nền, lưới mờ, chấm; bàn luôn vuông, tự co theo khung
- [x] **P0-09** Bắt cạnh gần điểm chạm nhất (không vùng chết), hiện cạnh mờ khi hover; chế độ chạm hai lần cho bàn 7×7 trên màn hình < 400px
- [x] **P0-10** Vẽ cạnh đã đi (màu theo người chơi) và ô đã ăn (tô đơn giản)

### M0.4 Vòng lặp chơi với bot tạm
- [x] **P0-11** Interface `GameController` (để sau này thay bằng bản online); `LocalBotController`: người chơi click → `applyMove` → renderer; **bot tạm** (ăn ô nếu có, còn lại ngẫu nhiên) đi với độ trễ tự nhiên
- [x] **P0-12** HUD theo bố cục dọc/ngang ở [11](11-responsive-i18n.md#bố-cục-màn-hình-chơi): tên, điểm, lượt; màn hình kết thúc; chơi lại; chọn bàn 3×3 / 5×5 / 7×7 (sau thay bằng bể map, P1-25)

✅ *Demo: chơi hết ván với bot tạm trên điện thoại, xoay màn hình không mất ván.*

### M0.5 Animation
- [x] **P0-13** Nét vẽ chạy từ chấm đến chấm (GSAP), hiệu ứng ăn ô gạch chéo + nảy nhẹ
- [x] **P0-14** Chữ "COMBO ×n" (qua hàm `t` truyền vào engine), particle giấy, đếm ô cuối ván; tôn trọng `prefers-reduced-motion`

### M0.6 Âm thanh
- [x] **P0-15** `AudioManager` (Howler, audio sprite) với âm thanh tạm (tổng hợp bằng script hoặc CC0, ghi `credits.md`); script build audio sprite; mở khóa audio iOS ở lần chạm đầu
- [x] **P0-16** Cao độ tăng dần khi ăn chuỗi, rung nhẹ; cài đặt âm lượng lưu `localStorage`

✅ *Demo: ván chơi có đủ hình và tiếng — đây là lúc tự hỏi "có đã tay không?"*

### M0.7 Bot
- [x] **P0-17** `bot.ts` theo [03 — Bot](03-luat-choi.md#bot): ăn ô, cạnh an toàn, nhường chuỗi ngắn nhất; tham số `strength` + lỗi có chủ đích; fixtures tình huống cho bot
- [ ] **P0-18** Luật chuỗi dài, double-cross, tìm kiếm alpha-beta cuối ván — *có thể để sau giai đoạn 1 nếu tốn thời gian*

### M0.8 Hoàn thiện & cho bạn bè thử
- [ ] **P0-19** Hoàn thiện trang chủ/menu; kiểm tra trên iOS Safari + Chrome Android thật, đủ các kích thước ở [11](11-responsive-i18n.md#kiểm-thử), cả hai ngôn ngữ
- [ ] **P0-20** Deploy bản tĩnh (VPS hoặc Vercel preview), gửi 5–10 người chơi thử, ghi lại phản hồi

**🏁 Tiêu chí hoàn thành giai đoạn 0:** người lạ mở link trên điện thoại, chơi hết ván với bot mà không cần hướng dẫn, ở cả hai ngôn ngữ; phản hồi về cảm giác chơi là tích cực.

---

## Giai đoạn 1 — Online phòng riêng

### M1.1 Khởi tạo backend
- [x] **P1-01** `api/` FastAPI: cấu hình settings, healthcheck, pytest; `docker-compose.yml` với Postgres + Redis cho dev
- [x] **P1-02** SQLAlchemy async + Alembic: `naming_convention`, `env.py` async, `alembic check` trong CI; model + migration đầu tiên (`users`, `auth_identities`, `sessions`, `matches` theo [05](05-co-so-du-lieu.md#tài-khoản))
- [x] **P1-03** i18n backend: `t(key, locale)`, `locales/vi.json` + `en.json`, xác định locale (`users.locale` → `Accept-Language` → `vi`), test hai file cùng tập key; lỗi trả `code` + `message` đã dịch

### M1.2 Luật chơi phía server
- [x] **P1-04** `rules.py` port từ `rules.ts`; pytest chạy trên cùng `shared/fixtures/`; CI chạy cả Vitest và pytest

✅ *Demo: hai bộ test cùng xanh trên một bộ fixtures.*

### M1.3 Xác thực (theo [13](13-xac-thuc.md))
- [x] **P1-05** Phiên: access JWT 1 giờ + refresh cookie xoay (`sessions`), `token_version`; đăng nhập khách (device id); `GET /me`, `PATCH /me` (tên hiển thị, `locale`); client đồng bộ ngôn ngữ đã chọn
- [x] ~~**P1-06** Email + mật khẩu~~ — **đã gỡ** theo [ADR-0011](adr/0011-chi-khach-va-google.md) (chỉ khách + Google)
- [x] **P1-07** Email giao dịch (Resend qua background task, `console` khi test, mẫu vi/en, bố cục sticker, gửi từ `no-reply@okia.io.vn`): thư chào mừng khi tài khoản Google vừa tạo. Mẫu xác minh/đặt lại mật khẩu đã gỡ cùng ADR-0011. *Còn lại:* webhook bounce của Resend
- [x] **P1-08** Google OAuth (PKCE, xác minh `id_token`), tự liên kết theo email đã xác minh, gộp tài khoản khách, xử lý `IDENTITY_TAKEN`; test
- [x] **P1-09** Giao diện: tab Tài khoản (khách → nút Google; tài khoản → email, đăng xuất, xóa); `DELETE /me` xóa mềm. Form email/mật khẩu và banner xác minh đã gỡ (ADR-0011)

✅ *Demo: khách chơi → Tiếp tục với Google → nhận thư chào mừng (Resend, no-reply@okia.io.vn) → điểm danh, nhiệm vụ mở ngay.*

**Đã làm (M1.3):** backend `api/app/auth/` (27 test), client `web/src/stores/auth.ts` + hộp thoại hồ sơ kiểu noitu (`components/auth/`), trang `/auth/verify`, `/auth/reset`, smoke `pnpm smoke:auth`. Cần cấu hình thật: `RESEND_API_KEY` + tên miền gửi, `GOOGLE_CLIENT_ID/SECRET` (xem `api/README.md`).

### M1.4 Nền WebSocket
- [x] **P1-10** Endpoint `/ws` xác thực JWT, nhận `lang`, `ping/pong`, gửi `error`; model Pydantic cho các tin nhắn theo [04](04-giao-thuc-ws.md)
- [x] **P1-11** Script xuất JSON Schema → sinh type TS vào `web/`; Redis pub/sub helper

### M1.5 Phòng đấu
- [x] **P1-12** `room_create` / `room_join`, lưu `room:{id}` trong Redis, gửi `room_state`
- [x] **P1-13** Xử lý `move`: khóa phòng, kiểm tra `seq`, `apply_move`, publish `moved`
- [x] **P1-14** `resign`, `game_over`, ghi trận vào bảng `matches`, dọn Redis

### M1.6 Timer & kết nối lại
- [x] **P1-15** Sorted set `deadlines` + worker quét mỗi giây (có khóa); hết giờ đi ngẫu nhiên; 3 lần → `afk`
- [x] **P1-16** `user:{id}:room`, `welcome.activeRoomId`, `opponent_status`

✅ *Demo: test tích hợp với 2 client WS giả chơi hết ván, kể cả rớt mạng giữa chừng.*

**Đã làm (M1.4–M1.7):** `api/app/ws/` (messages Pydantic → `shared/ws-schema.json` → `web/src/game/ws-types.ts` qua `pnpm gen:ws`), `api/app/game/room.py` (phòng trong Redis, mã 6 ký tự = id = mã mời), `timer.py` (worker hết giờ), `tests/test_ws.py` (2 client qua TestClient: hết ván, rớt mạng, hết giờ, afk, đầu hàng); web `net/ws-client.ts`, `game/network-controller.ts`, `/room` + `/r/[code]`, smoke `pnpm smoke:room` (hai trình duyệt). Chưa có: ghép trận (`queue` trả `UNSUPPORTED`, giai đoạn 2), chơi lại trong phòng, emote UI.

### M1.7 Client online
- [x] **P1-17** WS client có tự kết nối lại (backoff) và tự refresh access token, store trạng thái kết nối
- [x] **P1-18** `NetworkController` (cùng interface `GameController`): animate lạc quan, hoàn tác khi lỗi; hiển thị lỗi theo `code` đã dịch
- [x] **P1-19** Màn hình tạo phòng, trang mời `/r/[id]`, nút chia sẻ (Web Share API), ảnh OG theo ngôn ngữ khi dán link vào Zalo/Messenger. Ảnh OG dùng chung bộ nhận diện (`opengraph-image.png`, không có chữ theo ngôn ngữ — tiêu đề + mô tả đã theo ngôn ngữ)
- [x] **P1-20** Thanh đếm giờ lượt, báo đối thủ rớt mạng, màn hình kết thúc online

### M1.7b Bể map ([ADR-0009](adr/0009-be-map-hinh-thu.md))
- [x] **P1-24** Luật có mặt nạ ô (`VOID`) ở `rules.ts` / `rules.py` + fixtures dùng chung (cạnh ngoài bàn, lỗ, ván trọn vẹn trên map hình thù); bot bỏ qua ô ngoài bàn
- [x] **P1-25** Bể map `shared/maps/maps.json` (5×5, 7×7, 5 map hình thù, số ô lẻ) + script sinh cho web/api; bỏ 3×3 khỏi giao diện (còn là map ẩn cho test)
- [x] **P1-26** Server: `board` = id map hoặc `random`, `INVALID_BOARD`, `matches.board` 32 ký tự; luật phòng `showLastMove`
- [x] **P1-27** Renderer: giấy theo hình (viền, lỗ, ô li cắt theo hình), chấm/cạnh chỉ trong bàn, quầng đánh dấu nước đối thủ vừa đi; bộ chọn map có hình thu nhỏ + "Ngẫu nhiên" ở chơi với máy và phòng riêng

### M1.8 Triển khai
- [ ] **P1-21** VPS + Docker Compose production (container `api` chạy `alembic upgrade head` khi khởi động), Caddy, Cloudflare, tên miền; cấu hình SPF/DKIM cho email
- [ ] **P1-22** Backup `pg_dump` → R2, Sentry cho web và api, trang chính sách quyền riêng tư (vi/en)
- [ ] **P1-23** Test ảnh chụp màn hình Playwright: 3 kích thước × 2 ngôn ngữ cho trang chủ, đăng nhập, màn chơi, màn kết thúc

**🏁 Tiêu chí hoàn thành giai đoạn 1:** hai điện thoại ở hai mạng khác nhau chơi hết ván qua link mời; tắt mạng 20 giây rồi bật lại vẫn chơi tiếp được; mỗi người thấy giao diện theo ngôn ngữ của mình; đăng nhập Google trên production nhận được thư chào mừng.

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

### M2.5 Ví & sổ cái ([ADR-0010](adr/0010-hai-tien-diem-danh-nhiem-vu.md))
- [x] **P2-10** Model + migration `wallets` (hai loại tiền), `wallet_ledger`, `checkins`, `quest_progress`, `users.avatar_blob/avatar_version` (xem [05](05-co-so-du-lieu.md#kinh-tế)); ví tạo lười khi cộng lần đầu
- [x] **P2-11** Service `credit` / `debit` / `grant` với idempotency theo [06](06-kinh-te.md#quy-tắc-ví); test idempotency + `INSUFFICIENT_FUNDS`
- [x] **P2-11b** Điểm danh 7 ngày + nhiệm vụ ngày/tuần (`api/app/economy/`), `GET /me/progress`, `POST /me/checkin`, `POST /me/quests/{id}/claim`, `POST /me/events`; nuôi tiến trình từ `game_over` phòng online và ván bot ở client; giao diện tab Tổng quan / Nhiệm vụ trong hồ sơ, ví hai chip
- [x] **P2-11c** Ảnh đại diện tự tải: cắt ở client (react-easy-crop), server WebP 256px lưu Postgres, `GET /avatars/{id}.webp?v=N`

### M2.6 Thưởng
- [ ] **P2-12** Thưởng thắng trận xếp hạng khi `game_over` (cùng transaction với rating); không thưởng casual/bot/phòng riêng/afk/đầu hàng sớm; thông báo rõ ở màn hình chọn chế độ rằng chỉ xếp hạng mới cho Ruột chì
- [ ] **P2-13** Phát hiện dàn xếp kết quả: bảng `match_flags`, quy tắc cặp tài khoản gặp nhau bất thường, giữ thưởng/rating của trận bị cờ; test

### M2.7 Vật phẩm & trang bị
- [ ] **P2-14** Model + migration `items` (tên/mô tả `{vi, en}`, một cột `price`), `inventory`, `loadouts`; script seed từ `shared/skins/` (từ chối manifest thiếu ngôn ngữ); cấp skin mặc định cho người mới
- [ ] **P2-15** API mua (`purchase`: `debit` + `inventory` trong một transaction), trang bị (`PUT /loadout`); trả tên vật phẩm theo locale; gửi loadout trong `room_state`

### M2.8 Engine skin phía client
- [ ] **P2-16** Nạp manifest + asset theo nhu cầu, áp dụng bàn/bút/nét cho renderer; skin bút kèm kiểu chữ COMBO, loại vụn và bộ tiếng `capture`/`combo` riêng ([08](08-skin.md#manifest))
- [ ] **P2-17** Thư viện hiệu ứng ô (`hatch`, `fill`, `stamp`, `sticker`, `signature`); trang `/dev/skins` xem trước

### M2.9 Shop
- [ ] **P2-18** Trang shop responsive (lưới 2 cột trên điện thoại, nhiều cột trên desktop): danh mục, shop xoay vòng theo ngày, mua bằng Ruột chì, ví trên header
- [ ] **P2-19** Nút "Thử" trên bàn mẫu, luồng mua → đề nghị trang bị ngay; trang kho đồ & trang bị

### M2.10 Nội dung
### M2.11 Thành tựu, cấp độ, rương, tủ trưng bày ([ADR-0007](adr/0007-thanh-tuu-cap-do-ruong.md))
- [ ] **P2-22** Model + migration `achievements`, `user_achievements`, `users.exp/level`; service cập nhật metric khi `game_over` (mọi chế độ) và trao thưởng theo cấp (idempotent, chỉ một lần mỗi cấp); test
- [ ] **P2-23** Thành tựu & EXP cho **khách** ở client (store local) + gộp lên server khi tạo tài khoản với kiểm tra hợp lý; giao diện tab Thành tựu trong hồ sơ, toast "Thành tựu mới"
- [ ] **P2-24** Model + migration `collections`, `chests`, `chest_items`, `chest_opens`, `inventory.quantity`; service mở rương (RNG có seed, trùng → hoàn 50%, giá tăng trong ngày qua Redis); trang tỷ lệ công khai; test
- [ ] **P2-25** Giao diện rương (thẻ rương, danh sách vật phẩm + tỷ lệ, animation mở), tab Tủ đồ (lọc theo bộ, số lượng), tủ trưng bày 3 ô trong hồ sơ, hiển thị ở màn chờ/kết thúc
- [ ] **P2-26** Vật phẩm tiêu hao: thẻ đổi tên (lần đầu miễn phí); `showcase` API. (Avatar tùy chỉnh đã miễn phí ở P2-11c)

### M2.12 Pipeline asset & nội dung
- [ ] **P2-20** Pipeline `pnpm assets:build` đầy đủ (SVG → PNG, atlas, audio sprite, kiểm tra manifest) chạy trong CI
- [ ] **P2-21** 3 bộ sưu tập đầu tiên (Bút Bi, Mực Tím, Phấn Trắng; 12–20 vật phẩm/bộ, ≥ 70% thuần thủ tục/SVG) + khung/huy hiệu cấp độ + bộ âm thanh chính thức — *có thể làm song song từ giai đoạn 1*, xem [12](12-asset.md#lộ-trình-asset-song-song-với-09)

**🏁 Tiêu chí hoàn thành giai đoạn 2 (Beta công khai):** người chơi mới chơi bot với tư cách khách → mở thành tựu đầu tiên → tạo tài khoản (giữ tiến trình) → thắng trận xếp hạng → nhận Ruột chì → mở rương / mua lẻ → trang bị và trưng bày → đối thủ nhìn thấy; ván casual/bot/phòng riêng chỉ sinh EXP, không sinh dòng ledger ngoài thành tựu (đã có test chứng minh); trận bị cờ win-trading không trả thưởng.

---

## Giai đoạn 3 — Lan truyền & vận hành

Không có thứ tự cố định; chọn theo dữ liệu thực tế.

- [ ] **P3-01** Bảo mật tài khoản nâng cao: trang "Thiết bị đang đăng nhập" thu hồi từng phiên; nhà cung cấp OAuth thứ hai nếu cần (không quay lại mật khẩu, ADR-0011)
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
