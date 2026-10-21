# 05 — Cơ sở dữ liệu

## Quản lý schema bằng Alembic

**Nguồn chuẩn của schema là các model SQLAlchemy** trong `api/app/models/`. Đoạn SQL bên dưới chỉ để minh họa thiết kế; không chạy SQL tay lên database.

### Quy trình thay đổi schema
1. Sửa/thêm model trong `api/app/models/`.
2. `alembic revision --autogenerate -m "add loadouts"` để sinh migration.
3. **Đọc lại file migration**: autogenerate không nhận ra mọi thứ (đổi tên cột/bảng, `CHECK` constraint, kiểu enum, index biểu thức). Sửa tay những chỗ đó.
4. `alembic upgrade head` trên database dev, chạy test.
5. Thử `alembic downgrade -1` rồi `upgrade head` lại để chắc chắn migration đảo ngược được.
6. Commit model và migration **trong cùng một commit**.

### Quy tắc
- **Không sửa migration đã chạy** ở production; cần thay đổi thì tạo migration mới.
- Đặt `naming_convention` cho `MetaData` (khóa chính, khóa ngoại, unique, check, index) để tên constraint ổn định và autogenerate không sinh thay đổi thừa.
- **Dữ liệu khởi tạo bắt buộc** (vật phẩm mặc định, mùa giải đầu) đưa vào migration dữ liệu (`op.bulk_insert`). Danh mục skin thì dùng script seed riêng (xem [08](08-skin.md#quy-trình-thêm-skin)) vì thay đổi thường xuyên.
- Migration thay đổi dữ liệu lớn: tách làm hai bước (thêm cột cho phép NULL → điền dữ liệu → đặt NOT NULL) để không khóa bảng lâu.
- **CI chạy `alembic check`**: báo lỗi nếu model đã đổi mà chưa có migration.
- Khi deploy: container `api` chạy `alembic upgrade head` trước khi khởi động server.

## Postgres

Mọi bảng có `created_at TIMESTAMPTZ DEFAULT now()` (lược bớt bên dưới cho gọn). Các trường hiển thị cho người chơi lưu dạng JSONB `{"vi": "…", "en": "…"}` có ràng buộc đủ hai ngôn ngữ (xem [11](11-responsive-i18n.md#nội-dung-trong-database)).

### Tài khoản

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  email             TEXT UNIQUE,        -- đã lower(); NULL với khách
  email_verified_at TIMESTAMPTZ,
  email_bounced_at  TIMESTAMPTZ,       -- Resend báo bounce/complaint → không gửi nữa
  is_guest          BOOLEAN NOT NULL DEFAULT true,
  locale            TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en')),
  token_version     INT NOT NULL DEFAULT 1,   -- tăng để vô hiệu mọi phiên
  banned_until      TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ         -- xóa mềm, xóa cứng sau 30 ngày
);

CREATE TABLE auth_identities (
  provider      TEXT NOT NULL,          -- 'guest' | 'google' (password đã bỏ, ADR-0011)
  subject       TEXT NOT NULL,          -- guest: device id; google: sub
  user_id       UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (provider, subject),
);
CREATE INDEX ON auth_identities (user_id);

CREATE TABLE sessions (                 -- refresh token
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  refresh_hash  TEXT NOT NULL UNIQUE,   -- SHA-256 của refresh token
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoked_reason TEXT,                  -- 'replaced' = bị đá bởi lần đăng nhập nơi khác (docs/13)
  replaced_by   UUID                    -- phiên mới sau khi xoay
);
CREATE INDEX ON sessions (user_id);
```

Tài khoản thật có đúng một identity `google`. Khách nâng cấp → giữ `user_id`, thêm identity, đặt `email`, `is_guest = false`. Chi tiết luồng: [13](13-xac-thuc.md#gộp-tài-khoản).

### Xếp hạng & trận đấu

```sql
-- ĐÃ LÀM (ADR-0012): api/app/models/rating.py + migration b2262e36017a. Mùa tự mở khi mùa trước
-- hết (8 tuần); một dòng rating mỗi người mỗi mùa (không tách theo bàn — xếp hạng bốc map ngẫu nhiên).
CREATE TABLE seasons (
  id         SERIAL PRIMARY KEY,
  name       JSONB NOT NULL,            -- {"vi": "Học kỳ 1", "en": "Semester 1"}
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE ratings (
  user_id        UUID REFERENCES users ON DELETE CASCADE,
  season_id      INT  REFERENCES seasons ON DELETE CASCADE,
  mmr            FLOAT NOT NULL DEFAULT 1500,  -- rating ẩn Glicko-2 (không gửi client)
  rd             FLOAT NOT NULL DEFAULT 350,
  vol            FLOAT NOT NULL DEFAULT 0.06,
  points         INT NOT NULL DEFAULT 0,       -- điểm hạng hiển thị (≥ 0) → hạng/bậc
  peak_points    INT NOT NULL DEFAULT 0,
  games          INT NOT NULL DEFAULT 0,
  wins           INT NOT NULL DEFAULT 0,
  losses         INT NOT NULL DEFAULT 0,
  streak         INT NOT NULL DEFAULT 0,       -- thắng liên tiếp hiện tại
  best_streak    INT NOT NULL DEFAULT 0,
  peak_tier      TEXT,                         -- cho thưởng cuối mùa (P3-03)
  last_played_at TIMESTAMPTZ,                  -- rd tăng theo số ngày nghỉ
  PRIMARY KEY (user_id, season_id)
);
CREATE INDEX ON ratings (season_id, points);

CREATE TABLE matches (
  id           UUID PRIMARY KEY,
  mode         TEXT NOT NULL,           -- casual | ranked | private
  board        TEXT NOT NULL,
  season_id    INT REFERENCES seasons,
  player0      UUID REFERENCES users,   -- NULL nếu là bot
  player1      UUID REFERENCES users,
  bot_strength REAL,                   -- độ mạnh bot đã dùng (NULL nếu không có bot)
  moves        JSONB NOT NULL,          -- [{by, edge, t, reason}]
  scores       INT[] NOT NULL,
  winner       SMALLINT,                -- 0 | 1 | NULL (hòa)
  end_reason   TEXT NOT NULL,           -- complete | resign | afk
  rating_delta REAL[],                 -- đổi rating ẩn theo ghế (xếp hạng)
  points_delta INT[],                  -- đổi điểm hạng theo ghế (xếp hạng)
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON matches (player0, ended_at DESC);
CREATE INDEX ON matches (player1, ended_at DESC);
```

### Kinh tế

```sql
-- Hai loại tiền miễn phí (ADR-0010): Ruột chì (lead) và Hoa điểm tốt (flower). Tên tiền trong file dịch.
-- ĐÃ LÀM: api/app/models/economy.py + migration c2523bc2a547.

CREATE TABLE wallets (
  user_id   UUID PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  lead      BIGINT NOT NULL DEFAULT 0 CHECK (lead >= 0),
  flower    BIGINT NOT NULL DEFAULT 0 CHECK (flower >= 0)
);

CREATE TABLE wallet_ledger (            -- chỉ INSERT, không UPDATE/DELETE
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  currency         TEXT NOT NULL CHECK (currency IN ('lead', 'flower')),
  delta            BIGINT NOT NULL,     -- dương: cộng, âm: trừ
  balance_after    BIGINT NOT NULL,
  source           TEXT NOT NULL,       -- match | season | achievement | checkin | quest | chest_refund | purchase | chest | admin
  ref              TEXT,                -- match id, season id, item id, ngày điểm danh…
  idempotency_key  TEXT NOT NULL UNIQUE
);
CREATE INDEX ON wallet_ledger (user_id, id);

CREATE TABLE checkins (                 -- điểm danh: một dòng mỗi ngày (giờ VN)
  user_id  UUID REFERENCES users ON DELETE CASCADE,
  day      DATE,
  streak   INT NOT NULL DEFAULT 1,      -- ngày thứ mấy trong chuỗi liên tiếp
  PRIMARY KEY (user_id, day)
);

CREATE TABLE quest_progress (           -- nhiệm vụ theo kỳ: '2026-10-21' (ngày) | '2026-W43' (tuần)
  user_id     UUID REFERENCES users ON DELETE CASCADE,
  quest_id    TEXT,                     -- id trong api/app/economy/quests.py
  period      TEXT,
  progress    INT NOT NULL DEFAULT 0,
  claimed_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quest_id, period)
);
CREATE INDEX ON quest_progress (user_id, period);

-- users: avatar_seq INT đếm số lần tải ảnh (không giảm), avatar_version INT = seq đang dùng (0 = không có
-- ảnh riêng); object avatars/{id}/{seq}.webp trên MinIO/S3 (app/storage.py). Cột avatar_blob BYTEA từng
-- giữ ảnh trong DB đã bỏ (2026-10-21).

-- Skin (ADR-0013, ĐÃ LÀM: api/app/models/skins.py + migration d587729fc5d3). KHÔNG có bảng items:
-- catalog là file shared/skins/**.json → bản sinh api/app/skins/catalog.json; giá theo bậc hiếm
-- (common/uncommon/rare/epic: 100/250/600/1500 Ruột chì, legendary: 5 Hoa) nằm trong code.
CREATE TABLE inventory (
  user_id     UUID REFERENCES users ON DELETE CASCADE,
  item_id     TEXT,                     -- id trong catalog (skin default không ghi — ai cũng có)
  source      TEXT NOT NULL,            -- purchase | reward | admin
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE loadouts (                 -- không có dòng = dùng skin default
  user_id     UUID PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  pen         TEXT,
  box         TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng items/quantity (vật phẩm tiêu hao, thẻ) để lại cho giai đoạn rương/thẻ (ADR-0007):

-- Bộ sưu tập & rương (ADR-0007)
CREATE TABLE collections (
  id          TEXT PRIMARY KEY,         -- 'set_ballpoint'
  name        JSONB NOT NULL CHECK (name ? 'vi' AND name ? 'en'),
  badge_item  TEXT REFERENCES items     -- huy hiệu "trọn bộ"
);
ALTER TABLE items ADD COLUMN collection_id TEXT REFERENCES collections;

CREATE TABLE chests (
  id              TEXT PRIMARY KEY,     -- 'chest_ink_purple'
  name            JSONB NOT NULL CHECK (name ? 'vi' AND name ? 'en'),
  collection_id   TEXT REFERENCES collections,
  price           INT NOT NULL,
  daily_price_step REAL,                -- 0.5 = +50% mỗi lần mua trong ngày; NULL = giá cố định
  active          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE chest_items (
  chest_id    TEXT REFERENCES chests,
  item_id     TEXT REFERENCES items,
  weight      INT NOT NULL,             -- tỷ lệ = weight / tổng weight của rương (công khai)
  PRIMARY KEY (chest_id, item_id)
);

CREATE TABLE chest_opens (               -- mỗi lần mở là một bản ghi, kiểm toán được
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users,
  chest_id    TEXT NOT NULL REFERENCES chests,
  item_id     TEXT NOT NULL REFERENCES items,
  price_paid  INT NOT NULL,
  duplicate   BOOLEAN NOT NULL,
  refund      INT NOT NULL DEFAULT 0,
  rng_seed    TEXT NOT NULL
);
CREATE INDEX ON chest_opens (user_id, created_at DESC);

CREATE TABLE showcase (                  -- tủ trưng bày 3 ô
  user_id     UUID REFERENCES users,
  slot        SMALLINT CHECK (slot BETWEEN 0 AND 2),
  item_id     TEXT REFERENCES items,
  PRIMARY KEY (user_id, slot)
);

-- Thành tựu & cấp độ (ADR-0007)
CREATE TABLE achievements (
  id          TEXT PRIMARY KEY,         -- 'first_stroke'
  title       JSONB NOT NULL CHECK (title ? 'vi' AND title ? 'en'),
  description JSONB NOT NULL CHECK (description ? 'vi' AND description ? 'en'),
  metric      TEXT NOT NULL,            -- games_completed | bot_wins | max_combo | ranked_games | ranked_streak | peak_tier | private_games | items_owned | sets_completed
  tiers       JSONB NOT NULL,           -- [{"goal": 1, "reward": 10}, ...] tối đa 5 cấp
  active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE user_achievements (
  user_id         UUID REFERENCES users,
  achievement_id  TEXT REFERENCES achievements,
  progress        BIGINT NOT NULL DEFAULT 0,   -- giá trị hiện tại của metric (hoặc kỷ lục)
  claimed_tier    SMALLINT NOT NULL DEFAULT 0, -- số cấp đã nhận thưởng
  PRIMARY KEY (user_id, achievement_id)
);
-- users: thêm exp INT NOT NULL DEFAULT 0, level INT NOT NULL DEFAULT 1 (cấp n cần 50×n EXP)

-- loadouts: xem phần Skin ở trên (chỉ pen + box, ADR-0013).
```

### Phát hiện dàn xếp kết quả

```sql
CREATE TABLE match_flags (
  match_id   UUID PRIMARY KEY REFERENCES matches,
  reason     TEXT NOT NULL,             -- win_trading_pair | afk_pattern | manual
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | cleared | confirmed
  note       TEXT,
  reviewed_at TIMESTAMPTZ
);
```

Trận có cờ `pending`/`confirmed` không trả thưởng Ruột chì và không tính rating cho tới khi `cleared` (xem [06](06-kinh-te.md#chống-lạm-dụng)).

*Không có bảng nhiệm vụ:* mọi Ruột chì đến từ xếp hạng ([ADR-0005](adr/0005-mot-tien-te-donate.md)).

## Redis

| Key | Kiểu | TTL | Nội dung |
|---|---|---|---|
| `room:{id}` | String (JSON) | 2 giờ | Trạng thái ván + người chơi + cấu hình timer |
| `room:{id}:lock` | String | 2 giây | Khóa khi xử lý nước đi |
| kênh `room:{id}` | Pub/Sub | — | Phát `moved`, `game_over`, `opponent_status` |
| `user:{id}:room` | String | theo trận | Phòng đang chơi, để kết nối lại |
| `mm:ranked` | Sorted set | — | Hàng chờ xếp hạng, score = rating ẩn |
| `mm:ranked:info` | Hash | — | `userId` → JSON (tên, mmr, rd, hạng, thời điểm vào, đối thủ vừa gặp) |
| `mm:last:{userId}` | String | 1 giờ | Đối thủ xếp hạng gần nhất (tránh ghép lại ngay) |
| `online` | Sorted set | — | `userId` → lần cuối thấy (ms); đếm người online 60 giây gần nhất |
| kênh `user:{id}` | Pub/Sub | — | Tin riêng cho một người: `matched`, `queue_status` |
| `deadlines` | Sorted set | — | `roomId` với score = hạn giờ lượt (epoch ms) |
| `lock:mm`, `lock:timer` | String | 5 giây | Đảm bảo chỉ một worker nền chạy |
| `rl:{userId}:{action}` | String | 1–60 giây | Rate limit trong game |
| `rl:login:{email}`, `rl:login:{ip}` | String | 15 phút | Đếm đăng nhập sai |
| `rl:email:{email}:{purpose}` | String | 1 giờ | Giới hạn gửi lại email xác minh / đặt lại |
| `token:used:{jti}` | String | theo hạn token | Link xác minh / đặt lại đã dùng |
| `lb:{season}` | String (JSON) | 30 giây | Cache top 100 bảng xếp hạng |
| `bot:{userId}:streak` | String | 7 ngày | Chuỗi thắng/thua với bot (điều chỉnh `strength`) |
| `chest:{userId}:{chestId}:{date}` | String | 1 ngày | Số lần mua rương có `daily_price_step` trong ngày |

Khi ván kết thúc: ghi `matches`, cập nhật `ratings`, cộng thưởng vào ví — **trong một transaction Postgres** — rồi mới xóa `room:{id}`.
