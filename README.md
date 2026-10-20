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

## Chơi thử với máy khác trong mạng LAN

1. Chạy API mở ra mạng: `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` (CORS dev đã chấp nhận dải IP riêng).
2. Chạy web như bình thường (`pnpm dev`; `allowedDevOrigins` trong `next.config.ts` đã mở cho IP LAN).
3. Trên máy/điện thoại khác mở `http://<ip-máy-này>:3000`. Web tự gọi API ở cùng IP, cổng 8000;
   nếu API ở máy khác thì đặt `NEXT_PUBLIC_API_URL` trong `web/.env.local`.
4. Tạo phòng ở **Phòng riêng**, gửi mã 6 ký tự hoặc link `/r/<mã>` cho người kia.

## Chơi thử qua mạng LAN

Máy khác (điện thoại, laptop cùng Wi-Fi) mở `http://<ip-máy-này>:3000`. Đã cấu hình sẵn:

- `web/next.config.ts`: `allowedDevOrigins` cho dải IP riêng (`192.168.*.*`, `10.*.*.*`, `172.*.*.*`, `*.local`). Chỉ ảnh hưởng `next dev`.
- Web tự gọi API ở `http://<hostname-của-trang>:8000`, không cần `.env.local`.
- API (dev) chấp nhận CORS từ mọi origin thuộc dải IP riêng; production chỉ dùng `CORS_ORIGINS`.

Cần chạy API lắng nghe mọi interface: `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
(`pnpm dev` của Next mặc định đã lắng nghe `0.0.0.0`). Windows Firewall phải cho Node và Python nhận kết nối
(lần đầu chạy Windows sẽ hỏi). Xem IP: `ipconfig` → IPv4 của card Ethernet/Wi-Fi.
