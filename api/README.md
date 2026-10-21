# `api/` — backend FastAPI

```bash
docker compose up -d            # ở thư mục gốc: Postgres, Redis
cd api
cp .env.example .env
uv sync                         # tạo .venv và cài dependency
uv run alembic upgrade head     # áp dụng migration
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                   # test (luật chơi chạy trên shared/fixtures)
uv run ruff check . && uv run ruff format .
```

Đổi schema: sửa model trong `app/models/` → `uv run alembic revision --autogenerate -m "..."` → đọc lại file migration → `uv run alembic upgrade head`. Quy tắc đầy đủ: [docs/05](../docs/05-co-so-du-lieu.md#quản-lý-schema-bằng-alembic).

## Xác thực (docs/13)

Endpoint: `/auth/guest`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/google/start`,
`/auth/google/callback`, `/auth/dev-login` (ngoài production), `/me` (GET/PATCH/DELETE). Không có mật khẩu (ADR-0011). Xem `/docs` khi server chạy.

Cấu hình cần làm một lần:

- **Resend:** tạo API key tại https://resend.com/api-keys → `RESEND_API_KEY`. Chưa có tên miền thì giữ
  `EMAIL_FROM=Ô Kìa <onboarding@resend.dev>` (chỉ gửi được tới email đăng ký Resend). Có tên miền: thêm
  domain trên Resend, cấu hình SPF/DKIM/DMARC, đổi `EMAIL_FROM`.
- **Google:** Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
  Authorized redirect URI: `http://localhost:8000/auth/google/callback` (dev) và
  `https://api.<domain>/auth/google/callback` (prod) → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- `JWT_SECRET` ≥ 32 ký tự (`openssl rand -hex 32`).

Test chạy trên database `okia_test` (tự tạo) + Redis db 1, email provider `console`:

```bash
uv run pytest            # ~1–2 phút (mỗi test dọn bảng)
```
