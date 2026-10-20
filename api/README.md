# `api/` — backend FastAPI

```bash
docker compose up -d            # ở thư mục gốc: Postgres, Redis, Mailpit
cd api
cp .env.example .env
uv sync                         # tạo .venv và cài dependency
uv run alembic upgrade head     # áp dụng migration
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                   # test (luật chơi chạy trên shared/fixtures)
uv run ruff check . && uv run ruff format .
```

Đổi schema: sửa model trong `app/models/` → `uv run alembic revision --autogenerate -m "..."` → đọc lại file migration → `uv run alembic upgrade head`. Quy tắc đầy đủ: [docs/05](../docs/05-co-so-du-lieu.md#quản-lý-schema-bằng-alembic).
