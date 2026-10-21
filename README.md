# Ô Kìa

Trò ăn ô trên giấy ô li (Dots & Boxes) chơi trên web. Dự án cá nhân, phục vụ người chơi Việt Nam, hoàn toàn miễn phí.

| Thư mục | Nội dung |
|---|---|
| [`docs/`](docs/README.md) | Tài liệu thiết kế, lộ trình, quyết định kiến trúc |
| [`web/`](web/) | Frontend Next.js 16 + Chakra UI v3 + PixiJS |
| [`api/`](api/README.md) | Backend FastAPI + SQLAlchemy/Alembic + Redis |
| [`shared/`](shared/) | Fixtures luật chơi và manifest skin dùng chung |

## Chạy frontend

```bash
cd web
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # Vitest
pnpm lint && pnpm typecheck && pnpm build
```

Yêu cầu Node 20+ và pnpm 12 (`npm i -g pnpm`).

## Chạy backend

```bash
docker compose up -d        # Postgres (cổng 5433), Redis (6380) — tránh đụng cổng mặc định
cd api
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
uv run pytest
```

Yêu cầu Python 3.13, [uv](https://docs.astral.sh/uv/) và Docker.

## CI/CD

GitHub Actions: [`web.yml`](.github/workflows/web.yml) chạy khi đổi `web/`, [`api.yml`](.github/workflows/api.yml)
khi đổi `api/`. Build trên `ubuntu-latest` (hết quota thì self-hosted runner minisforum), deploy container lên
minisforum. Cài runner, secret, biến môi trường: [deploy/README.md](deploy/README.md).

