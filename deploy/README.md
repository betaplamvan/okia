# CI/CD — GitHub Actions, triển khai trên minisforum

Hai luồng độc lập, mỗi luồng chỉ chạy khi phần của nó thay đổi:

| Workflow | Kích hoạt khi đổi | Image |
|---|---|---|
| [`web.yml`](../.github/workflows/web.yml) | `web/**`, `shared/**` | `ghcr.io/<owner>/okia-web` |
| [`api.yml`](../.github/workflows/api.yml) | `api/**`, `shared/fixtures/**` | `ghcr.io/<owner>/okia-api` |

Commit chỉ sửa `docs/` không chạy gì. Sửa `deploy/deploy-container.sh` thì chạy cả hai luồng.

## Mỗi luồng

```
push main ─► Build (GitHub, ubuntu-latest) ──thành công──────────────┐
                 │ không nhận được runner (hết quota)                ├─► Deploy (minisforum)
                 └─► Build (minisforum, dự phòng) ──thành công───────┘
pull_request ─► chỉ Build, không push image, không deploy
```

- **Build** = lint/format/typecheck/test + build image Docker + push GHCR (tag `<sha>` và `latest`).
  Bước dùng chung nằm trong composite action [`web-ci`](../.github/actions/web-ci/action.yml) và
  [`api-ci`](../.github/actions/api-ci/action.yml).
- **Dự phòng** chỉ chạy khi job GitHub *chưa chạy được bước nào* (hết phút, chạm spending limit). Lỗi code
  thật (test đỏ) thì không build lại trên minisforum. Khi biết chắc đã hết quota cả tháng, đặt biến repo
  `CI_RUNNER=minisforum` để bỏ hẳn job GitHub (tránh một job đỏ mỗi lần). `CI_RUNNER=github` thì tắt dự phòng.
  Chạy tay: Actions → chọn workflow → *Run workflow* → chọn `runner`.
- **Deploy** ([`deploy-container.sh`](deploy-container.sh)): pull image theo sha, thay container, chờ
  healthcheck; không healthy thì chạy lại image cũ và báo đỏ. Giữ 3 image gần nhất trên máy, 10 bản trên GHCR.
  Container chạy với `--ulimit nofile=65536` (mỗi WebSocket một fd; mặc định Docker 1024 chỉ đủ ~1 000
  kết nối), `--memory`/`--cpus` theo biến ở trên, log rotation 3 × 20 MB. API chạy `WEB_CONCURRENCY=2` worker.
- **pytest của API:** trên GitHub dùng Postgres/Redis tạm (service container, tự hủy). Trên minisforum
  **không dựng thêm** Postgres/Redis — dùng bản có sẵn qua secret `TEST_DATABASE_URL`/`TEST_REDIS_URL`.

## Chuẩn bị minisforum (một lần)

Yêu cầu: Linux x64, Docker Engine, user chạy runner thuộc nhóm `docker`.

1. **Runner:** GitHub → repo `okia` → Settings → Actions → Runners → *New self-hosted runner* (Linux x64),
   làm theo lệnh hiện ra. Khi `./config.sh` hỏi label, thêm **`minisforum`**. Chạy như service:
   `sudo ./svc.sh install && sudo ./svc.sh start`. (Runner gắn theo repo — runner của QHome không tự dùng
   được cho okia, trừ khi đăng ký ở cấp organization.)
2. **Postgres/Redis** (tự chuẩn bị, workflow không tạo):
   - Database `okia` cho production. API tự chạy `alembic upgrade head` mỗi lần khởi động.
   - Cho pytest khi build dự phòng: user có quyền `CREATEDB` (conftest kết nối DB `okia` rồi tự tạo
     `okia_test`); Redis dùng **db khác production** (ví dụ `/1`) vì test `FLUSHDB` trước mỗi ca.
   - Container `okia-api` chạy trong docker network `okia` (đổi bằng biến `DOCKER_NETWORK`). Postgres/Redis
     chạy bằng Docker → `docker network connect okia <container>` rồi dùng tên container làm host. Cài thẳng
     trên máy → dùng host `host.docker.internal` (đã map sẵn), nhớ cho Postgres/Redis nghe trên IP của bridge
     Docker (`listen_addresses`, `bind`) và cho phép trong `pg_hba.conf`.
3. **Reverse proxy / HTTPS** (Caddy, Cloudflare Tunnel…) trỏ vào cổng `WEB_PORT` và `API_PORT` — chưa nằm
   trong workflow. API phải có WebSocket (`/ws`).

## Bí mật: file local là nguồn gốc

`deploy/.env.production` (gitignore, chỉ có trên máy người phát triển) giữ mọi bí mật kèm bản URL để chạy
từ máy local qua SSH tunnel. Sửa file đó rồi đẩy lên GitHub (cần `gh auth login` một lần):

```bash
bash deploy/sync-secrets.sh --dry-run   # xem sẽ đặt gì
bash deploy/sync-secrets.sh             # secret + variable cho Environment production, secret cấp repo
```

File tải về từ bên thứ ba (JSON OAuth client của Google…) để trong `deploy/secrets/` (gitignore); giá trị
`client_id`/`client_secret` trong đó chép vào `.env.production` và `api/.env`. Đổi secret trên Google
Console thì phải cập nhật cả hai file rồi chạy lại script.

Chạy test API từ máy local trên DB thật của minisforum (`okia_test`, Redis db 3): mở tunnel theo lệnh ghi
trong file, rồi

```bash
cd api && set -a && . ../deploy/.env.production && set +a
TEST_DATABASE_URL=$LOCAL_TEST_DATABASE_URL TEST_REDIS_URL=$LOCAL_TEST_REDIS_URL uv run pytest
```

## Cấu hình trên GitHub

**Settings → Secrets and variables → Actions** (cấp repo):

| Loại | Tên | Ghi chú |
|---|---|---|
| Variable (**repo**, không phải environment) | `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_HOME` | Google AdSense ([docs/10](../docs/10-phap-ly.md#quảng-cáo)): mã `ca-pub-…` và `data-ad-slot` của ô trang chủ. Nhúng lúc build — job build không dùng environment `production`, nên các biến `NEXT_PUBLIC_*` phải đặt ở Settings → Secrets and variables → Actions → **Variables** cấp repo (như `NEXT_PUBLIC_API_URL`); rỗng → không có quảng cáo |
| Variable | `NEXT_PUBLIC_API_URL` | URL public của API, ví dụ `https://api.okia.vn`. Nhúng vào bundle lúc build. Để trống → web gọi `http(s)://<hostname-của-trang>:8000` |
| Variable | `NEXT_PUBLIC_WS_URL` | Tùy chọn; mặc định suy ra từ API URL (`ws(s)://…/ws`) |
| Variable | `CI_RUNNER` | Tùy chọn: `auto` (mặc định) / `github` / `minisforum` |
| Secret | `TEST_DATABASE_URL` | Chỉ cho build dự phòng, ví dụ `postgresql+asyncpg://okia:***@host.docker.internal:5432/okia_test` |
| Secret | `TEST_REDIS_URL` | Ví dụ `redis://host.docker.internal:6379/1` |

**Settings → Environments → `production`** (job deploy dùng; có thể bật *Required reviewers* để duyệt tay):

| Loại | Tên | Ghi chú |
|---|---|---|
| Secret | `DATABASE_URL` | **Bắt buộc.** `postgresql+asyncpg://…/okia` |
| Secret | `REDIS_URL` | **Bắt buộc.** `redis://…/0` |
| Secret | `JWT_SECRET` | **Bắt buộc**, ≥ 32 ký tự (`openssl rand -hex 32`) |
| Secret | `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Tùy chọn |
| Secret | `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO/S3 giữ ảnh đại diện; thiếu thì ảnh chỉ nằm trong bộ nhớ container (mất khi deploy) |
| Variable | `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_PUBLIC_URL` | Endpoint MinIO, bucket, URL đọc công khai (xem [docs/02](../docs/02-kien-truc.md#môi-trường)) |
| Variable | `APP_BASE_URL`, `API_BASE_URL`, `CORS_ORIGINS` | URL public của web / API; CORS = origin của web |
| Variable | `COOKIE_SECURE` | `true` khi chạy https |
| Variable | `ADMIN_EMAILS` | Email (Google, đã xác minh) được quyền admin, cách nhau bởi dấu phẩy — trang `/admin` ([docs/13](../docs/13-xac-thuc.md)) |
| Variable | `DONATE_BANK_BIN`, `DONATE_BANK_NAME`, `DONATE_ACCOUNT_NO`, `DONATE_ACCOUNT_NAME` | Trang `/donate` ([docs/10](../docs/10-phap-ly.md#donate)): BIN NAPAS (MB 970422…), số tài khoản, tên chủ tài khoản hiện công khai |
| Secret | `SEPAY_API_KEY` | Webhook ủng hộ SePay (`Authorization: Apikey …`, URL `https://api…/donate/webhook/sepay`) |
| Variable | `COOKIE_DOMAIN`, `GOOGLE_CLIENT_ID`, `EMAIL_PROVIDER`, `EMAIL_FROM` | Tùy chọn (ý nghĩa: [docs/02](../docs/02-kien-truc.md#môi-trường), `api/.env.example`) |
| Variable | `WEB_PORT`, `API_PORT` | Cổng trên máy, mặc định `3000`, `8000` |
| Variable | `API_MEM_LIMIT`, `API_CPU_LIMIT`, `WEB_MEM_LIMIT`, `WEB_CPU_LIMIT` | Giới hạn `--memory`/`--cpus` cho container, mặc định `1g`/`2` và `768m`/`1.5` (máy chạy chung nhiều dịch vụ) |
| Variable | `DOCKER_NETWORK` | Mặc định `okia` |

Biến để trống không được truyền vào container → API dùng mặc định trong `app/config.py`.

## Chạy tay trên máy

```bash
# Build như CI (context: web dùng gốc repo, api dùng api/)
docker build -f web/Dockerfile -t okia-web:local .
docker build -t okia-api:local api

# Thử script deploy với image local
SKIP_PULL=1 NAME=okia-web IMAGE=okia-web:local PORT_MAP=3000:3000 NETWORK=okia bash deploy/deploy-container.sh
```

Kiểm tra workflow trước khi push: `uvx --from actionlint-py actionlint` (label `minisforum` khai báo trong
`.github/actionlint.yaml`).
