# 02 — Kiến trúc & tech stack

## Sơ đồ

```
 Trình duyệt
 ┌──────────────────────────────┐
 │ Next.js (App Router)         │
 │  ├ UI: shop, hồ sơ, BXH      │──REST──┐
 │  └ /play: PixiJS + GSAP      │        │
 │           + Howler           │──WS────┤
 └──────────────────────────────┘        ▼
                              ┌─────────────────────┐
                              │ FastAPI (uvicorn)   │
                              │  ├ REST             │
                              │  ├ WS phòng đấu     │
                              │  └ Worker nền:      │
                              │    ghép trận, timer │
                              └───┬────────────┬────┘
                                  ▼            ▼
                               ┌───────┐   ┌──────────┐
                               │ Redis │   │ Postgres │
                               └───────┘   └──────────┘
```

**Nguyên tắc cốt lõi: server quyết định (server-authoritative).** Client chỉ gửi ý định (vẽ cạnh nào); server kiểm tra hợp lệ, tính điểm, cộng tiền, cập nhật hạng. Client không bao giờ tự quyết điểm số hay số dư.

## Tech stack

### Frontend — `web/`
| Thành phần | Công nghệ |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Vẽ bàn đấu | PixiJS v8 |
| Animation | GSAP |
| Âm thanh | Howler.js (audio sprite) |
| Nét vẽ tay | rough.js hoặc shader tự viết |
| UI | Chakra UI v3 (style props responsive, recipe nút "sticker", layerStyle). **Một theme cố định, không color mode** ([14](14-thiet-ke-giao-dien.md)): snippet `next-themes` của Chakra không còn bảo trì và gây lỗi hydration với React 19.3 / Next 16.2+, và mẫu thiết kế cũng không có sáng/tối |
| Đa ngôn ngữ | next-intl (`vi` mặc định, `en`) |
| State client (ván đang chơi, kết nối, cài đặt) | Zustand — không dùng Redux, thừa cho quy mô này |
| Dữ liệu server (hồ sơ, shop, BXH) | SWR (cùng hệ sinh thái Vercel, thay TanStack Query) |
| Type từ API | `openapi-typescript` + `openapi-fetch` (REST), `json-schema-to-typescript` (tin nhắn WS) |
| Test | Vitest |

Engine game là **class TypeScript thuần** trong `web/src/game/`, mount vào một client component ở `/play` qua `useEffect`. React không re-render theo frame.

Responsive (mobile-first, tối thiểu 320px) và i18n: xem [11](11-responsive-i18n.md).

### Backend — `api/`
| Thành phần | Công nghệ |
|---|---|
| Framework | FastAPI + uvicorn |
| Model / validate | Pydantic v2 |
| ORM | SQLAlchemy 2.0 async + asyncpg |
| Migration | Alembic — autogenerate từ model SQLAlchemy (quy trình: [05](05-co-so-du-lieu.md#quản-lý-schema-bằng-alembic)) |
| Đa ngôn ngữ | Catalog JSON + hàm `t()` tự viết ([11](11-responsive-i18n.md#backend--fastapi)) |
| Redis | `redis.asyncio` |
| Xác thực | Khách, email + mật khẩu (Argon2id), Google OAuth (PKCE); access JWT + refresh cookie — xem [13](13-xac-thuc.md) |
| Email giao dịch | Resend (SDK `resend`) — dùng cả khi dev, gói miễn phí đủ |
| Test | pytest + pytest-asyncio |

### Dịch vụ LLM (Qwen) — cho cá tính bot
- Server Qwen có sẵn của người phát triển, gọi **chỉ từ `api/`** (không bao giờ từ trình duyệt).
- Giả định server có API tương thích OpenAI (`/v1/chat/completions`, như vLLM/Ollama); nếu không, viết adapter trong `api/app/llm/client.py`.
- Gọi qua hàng đợi bất đồng bộ, timeout 3 giây, có câu dự phòng. LLM sập thì game vẫn chạy bình thường.
- Chi tiết: [03 — Cá tính bot](03-luat-choi.md#cá-tính-bot-llm), [ADR-0003](adr/0003-bot-thuat-toan-va-llm.md).

### Dữ liệu
- **Postgres:** dữ liệu lâu dài — tài khoản, trận đấu, hạng, ví, sổ cái, kho đồ. Xem [05](05-co-so-du-lieu.md).
- **Redis:** dữ liệu nóng — trạng thái trận đang chơi, hàng chờ ghép trận, hạn giờ lượt, pub/sub giữa các worker, rate limit, cache BXH.

## Luật chơi viết hai lần

Luật cần chạy ở client (chơi offline, bot, animation tức thì) **và** server (kết quả chính thức). Ta chấp nhận viết hai bản: `web/src/game/rules.ts` và `api/app/game/rules.py`.

Đồng bộ bằng **fixtures dùng chung** trong `shared/fixtures/*.json`; cả Vitest và pytest cùng chạy trên bộ này. Bản nào lệch → CI đỏ. Định dạng fixture: xem [03](03-luat-choi.md#fixtures-dùng-chung).

## Cấu trúc repo

```
okia/                        # repo (monorepo)
├─ docs/                     # tài liệu này
├─ web/                      # Next.js
│  ├─ messages/              # vi.json, en.json
│  └─ src/
│     ├─ app/[locale]/       # route: /, /play, /shop, /profile, /leaderboard
│     ├─ i18n/               # cấu hình next-intl
│     ├─ game/               # engine: rules.ts, bot.ts, renderer/, audio/, skins/
│     └─ lib/                # api client, store
├─ api/                      # FastAPI
│  ├─ app/
│  │  ├─ game/               # rules.py, room.py, bot.py
│  │  ├─ llm/                # client.py, prompts.py, fallback_lines.py
│  │  ├─ ws/                 # endpoint & handler WebSocket
│  │  ├─ matchmaking/
│  │  ├─ rating/             # glicko2.py, tiers.py
│  │  ├─ economy/            # wallet.py, shop.py, rewards.py
│  │  ├─ auth/
│  │  ├─ i18n/               # t(), locales/vi.json, locales/en.json
│  │  └─ models/             # SQLAlchemy — nguồn chuẩn của schema
│  ├─ alembic/
│  └─ tests/
├─ shared/
│  ├─ fixtures/              # test luật dùng chung
│  └─ skins/                 # manifest JSON skin
└─ docker-compose.yml
```

## Triển khai

> **Hiện tại** ([ADR-0008](adr/0008-ci-cd-minisforum.md)): GitHub Actions build image (ưu tiên runner GitHub,
> hết quota thì minisforum) → GHCR → deploy container `web`, `api` trên máy minisforum; Postgres/Redis có sẵn
> trên máy, không do CI/CD tạo. Hướng dẫn: [deploy/README.md](../deploy/README.md). Phần dưới là kế hoạch
> VPS ban đầu, giữ làm hướng đi khi cần chuyển lên VPS.

- Một VPS (Việt Nam hoặc Singapore, ~2 vCPU / 4 GB RAM) chạy **Docker Compose**: `caddy`, `web`, `api`, `postgres`, `redis`.
- **Caddy**: reverse proxy, HTTPS tự động, hỗ trợ WebSocket.
- **Cloudflare** (gói miễn phí) phía trước: DNS, CDN cho asset skin, chống DDoS. Asset lớn đặt trên **Cloudflare R2**.
- Next.js build `output: "standalone"`.
- Sao lưu: cron `pg_dump` hằng ngày → R2, giữ 14 bản.
- Giám sát: Sentry (lỗi), PostHog (hành vi).

### Mở rộng
- Bắt đầu với **1 worker uvicorn** — game theo lượt, tải thấp, asyncio chịu được vài nghìn kết nối WS.
- Khi cần nhiều worker: trạng thái phòng đã nằm ở Redis và sự kiện phát qua Redis pub/sub, nên không cần sticky session cho logic. Các worker nền (ghép trận, quét timer) chỉ chạy **một bản** nhờ khóa Redis (`SET lock:mm NX PX`).

## Môi trường

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `DATABASE_URL` | Postgres | — |
| `REDIS_URL` | Redis | — |
| `JWT_SECRET` | Ký token | — |
| `APP_BASE_URL` | URL public của web, dùng trong link email và callback OAuth | — |
| `API_BASE_URL` | URL public của API, dựng `redirect_uri` Google = `{API_BASE_URL}/auth/google/callback` | `http://localhost:8000` |
| `COOKIE_SECURE`, `COOKIE_DOMAIN` | Cookie refresh: `Secure` khi https; domain khi web và api khác subdomain | `false`, — |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth Google (để trống = nút Google báo `GOOGLE_DISABLED`) | — |
| `EMAIL_PROVIDER` | `resend` \| `console` (chỉ in log khi chạy test) | `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend; `EMAIL_FROM` dạng `Ô Kìa <no-reply@okia.vn>` (chưa có tên miền thì `onboarding@resend.dev` chỉ gửi được tới email chủ tài khoản Resend) | — |
| `RESEND_WEBHOOK_SECRET` | Xác minh chữ ký webhook bounce/complaint | — |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO/S3 giữ ảnh người dùng tải lên (`avatars/{id}/{n}.webp`, mỗi lần tải một khóa mới); để trống = giữ trong bộ nhớ, mất khi restart (chỉ test/dev) | — |
| `S3_BUCKET`, `S3_REGION` | Bucket và region ký S3v4 | `okia-bucket`, `us-east-1` |
| `S3_PUBLIC_URL` | URL gốc đọc ẩn danh của bucket (vd `https://minio.example.com/okia-bucket`, cấp quyền bằng `python -m scripts.s3_setup`); trống = API phục vụ hộ qua `/avatars/{id}/{n}.webp` | — |
| `LLM_BASE_URL` | Địa chỉ server Qwen | — (để trống = tắt, chỉ dùng câu soạn sẵn) |
| `LLM_MODEL` | Tên model | — |
| `LLM_TIMEOUT_MS` | Timeout mỗi lần gọi | `3000` |
