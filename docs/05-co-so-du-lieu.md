# 05 — Cơ sở dữ liệu

## Quản lý schema bằng Alembic

**Nguồn chuẩn của schema là các model SQLAlchemy** trong `api/app/models/`. Đoạn SQL bên dưới chỉ để minh họa thiết kế; không chạy SQL tay lên database.

### Quy trình thay đổi schema
1. Sửa/thêm model trong `api/app/models/`.
2. `alembic revision --autogenerate -m "add wishlist"` để sinh migration.
3. **Đọc lại file migration**: autogenerate không nhận ra mọi thứ (đổi tên cột/bảng, `CHECK` constraint, kiểu enum, index biểu thức). Sửa tay những chỗ đó.
4. `alembic upgrade head` trên database dev, chạy test.
5. Thử `alembic downgrade -1` rồi `upgrade head` lại để chắc chắn migration đảo ngược được.
6. Commit model và migration **trong cùng một commit**.

### Quy tắc
- **Không sửa migration đã chạy** ở production; cần thay đổi thì tạo migration mới.
- Đặt `naming_convention` cho `MetaData` (khóa chính, khóa ngoại, unique, check, index) để tên constraint ổn định và autogenerate không sinh thay đổi thừa.
- **Dữ liệu khởi tạo bắt buộc** (bảng `currencies`, vật phẩm mặc định) đưa vào migration dữ liệu (`op.bulk_insert`). Danh mục skin thì dùng script seed riêng (xem [08](08-skin.md#quy-trình-thêm-skin)) vì thay đổi thường xuyên.
- Migration thay đổi dữ liệu lớn: tách làm hai bước (thêm cột cho phép NULL → điền dữ liệu → đặt NOT NULL) để không khóa bảng lâu.
- **CI chạy `alembic check`**: báo lỗi nếu model đã đổi mà chưa có migration.
- Khi deploy: container `api` chạy `alembic upgrade head` trước khi khởi động server.

## Postgres

Mọi bảng có `created_at TIMESTAMPTZ DEFAULT now()` (lược bớt bên dưới cho gọn). Các trường hiển thị cho người chơi lưu dạng JSONB `{"vi": "…", "en": "…"}` có ràng buộc đủ hai ngôn ngữ (xem [11](11-responsive-i18n.md#nội-dung-trong-database)).

### Tài khoản

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  is_guest      BOOLEAN NOT NULL DEFAULT true,
  locale        TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en')),
  banned_until  TIMESTAMPTZ
);

CREATE TABLE auth_identities (
  provider      TEXT NOT NULL,          -- 'guest' | 'google' | 'zalo'
  subject       TEXT NOT NULL,          -- id phía provider (guest: device id)
  user_id       UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);
```

Liên kết tài khoản: người chơi khách đăng nhập Google/Zalo → thêm dòng `auth_identities` cho cùng `user_id`, đặt `is_guest = false`. Không mất tiến trình.

### Xếp hạng & trận đấu

```sql
CREATE TABLE seasons (
  id         SERIAL PRIMARY KEY,
  name       JSONB NOT NULL CHECK (name ? 'vi' AND name ? 'en'),
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE ratings (
  user_id    UUID REFERENCES users,
  season_id  INT  REFERENCES seasons,
  board      TEXT NOT NULL DEFAULT '5x5',
  mmr        REAL NOT NULL DEFAULT 1500,
  rd         REAL NOT NULL DEFAULT 350,
  vol        REAL NOT NULL DEFAULT 0.06,
  games      INT  NOT NULL DEFAULT 0,
  wins       INT  NOT NULL DEFAULT 0,
  peak_tier  TEXT,
  PRIMARY KEY (user_id, season_id, board)
);

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
  rating_delta REAL[],
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON matches (player0, ended_at DESC);
CREATE INDEX ON matches (player1, ended_at DESC);
```

### Kinh tế

```sql
CREATE TABLE currencies (
  code     TEXT PRIMARY KEY,            -- 'soft' | 'hard'
  name     JSONB NOT NULL CHECK (name ? 'vi' AND name ? 'en'),  -- {"vi":"Ruột chì","en":"Lead"}
  enabled  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE wallets (
  user_id   UUID REFERENCES users,
  currency  TEXT REFERENCES currencies,
  balance   BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  PRIMARY KEY (user_id, currency)
);

CREATE TABLE wallet_ledger (            -- chỉ INSERT, không UPDATE/DELETE
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL,
  currency         TEXT NOT NULL REFERENCES currencies,
  delta            BIGINT NOT NULL,     -- dương: cộng, âm: trừ
  balance_after    BIGINT NOT NULL,
  source           TEXT NOT NULL,       -- match | quest | daily | purchase | payment | admin | season
  ref              TEXT,                -- match id, item id, mã giao dịch…
  idempotency_key  TEXT NOT NULL UNIQUE
);

CREATE TABLE items (
  id          TEXT PRIMARY KEY,         -- 'pen_ink_purple'
  type        TEXT NOT NULL,            -- pen | stroke | box | board
  rarity      TEXT NOT NULL,            -- common | rare | epic | legendary | reward
  price_soft  INT,
  price_hard  INT,
  name        JSONB NOT NULL CHECK (name ? 'vi' AND name ? 'en'),
  description JSONB CHECK (description IS NULL OR (description ? 'vi' AND description ? 'en')),
  manifest    JSONB NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  CHECK (price_soft IS NOT NULL OR price_hard IS NOT NULL OR rarity = 'reward')
);

CREATE TABLE inventory (
  user_id     UUID REFERENCES users,
  item_id     TEXT REFERENCES items,
  source      TEXT NOT NULL,            -- default | purchase | reward
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE loadouts (
  user_id     UUID PRIMARY KEY REFERENCES users,
  pen         TEXT REFERENCES items,
  stroke      TEXT REFERENCES items,
  box         TEXT REFERENCES items,
  board       TEXT REFERENCES items
);

CREATE TABLE wishlist (
  user_id     UUID REFERENCES users,
  item_id     TEXT REFERENCES items,
  PRIMARY KEY (user_id, item_id)
);
```

### Nhiệm vụ

```sql
CREATE TABLE quests (
  id        TEXT PRIMARY KEY,           -- 'daily_win_3'
  title     JSONB NOT NULL CHECK (title ? 'vi' AND title ? 'en'),  -- {"vi":"Thắng 3 trận","en":"Win 3 matches"}
  period    TEXT NOT NULL,              -- daily | weekly
  goal      JSONB NOT NULL,             -- {"event": "win", "count": 3}
  reward    INT NOT NULL,               -- Ruột chì (luôn là tiền thường)
  active    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE user_quests (
  user_id   UUID REFERENCES users,
  quest_id  TEXT REFERENCES quests,
  period_key TEXT NOT NULL,             -- '2026-10-20' hoặc '2026-W43'
  progress  INT NOT NULL DEFAULT 0,
  claimed   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, quest_id, period_key)
);
```

## Redis

| Key | Kiểu | TTL | Nội dung |
|---|---|---|---|
| `room:{id}` | String (JSON) | 2 giờ | Trạng thái ván + người chơi + cấu hình timer |
| `room:{id}:lock` | String | 2 giây | Khóa khi xử lý nước đi |
| kênh `room:{id}` | Pub/Sub | — | Phát `moved`, `game_over`, `opponent_status` |
| `user:{id}:room` | String | theo trận | Phòng đang chơi, để kết nối lại |
| `mm:{mode}:{board}` | Sorted set | — | Hàng chờ, score = MMR |
| `mm:joined:{userId}` | String | 10 phút | Thời điểm vào hàng chờ |
| `deadlines` | Sorted set | — | `roomId` với score = hạn giờ lượt (epoch ms) |
| `lock:mm`, `lock:timer` | String | 5 giây | Đảm bảo chỉ một worker nền chạy |
| `rl:{userId}:{action}` | String | 1–60 giây | Rate limit |
| `lb:{season}:{board}` | Sorted set | — | Cache bảng xếp hạng |
| `daily_soft:{userId}:{date}` | String | 1 ngày | Ruột chì đã kiếm hôm nay (trần) |
| `bot:{userId}:streak` | String | 7 ngày | Chuỗi thắng/thua với bot (điều chỉnh `strength`) |

Khi ván kết thúc: ghi `matches`, cập nhật `ratings`, cộng thưởng vào ví — **trong một transaction Postgres** — rồi mới xóa `room:{id}`.
