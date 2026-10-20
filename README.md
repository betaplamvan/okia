# Ô Kìa

Trò ăn ô trên giấy ô li (Dots & Boxes) chơi trên web. Dự án cá nhân, phục vụ người chơi Việt Nam, hoàn toàn miễn phí.

| Thư mục | Nội dung |
|---|---|
| [`docs/`](docs/README.md) | Tài liệu thiết kế, lộ trình, quyết định kiến trúc |
| [`web/`](web/) | Frontend Next.js 16 + Chakra UI v3 + PixiJS |
| `api/` | Backend FastAPI (giai đoạn 1) |
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
