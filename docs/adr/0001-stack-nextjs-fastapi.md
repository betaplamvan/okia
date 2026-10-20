# ADR-0001 — Dùng Next.js + FastAPI + Postgres + Redis thay vì Nakama

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận

## Bối cảnh

Game cần: đăng nhập, phòng đấu realtime, ghép trận, xếp hạng, ví tiền trong game. Nakama (game server mã nguồn mở) có sẵn hầu hết các tính năng này. Tuy nhiên đây là dự án cá nhân và người phát triển đã quen Next.js, FastAPI, Postgres, Redis.

## Quyết định

- Frontend: Next.js + PixiJS/GSAP/Howler.
- Backend: FastAPI (REST + WebSocket), server quyết định mọi kết quả.
- Redis cho trạng thái nóng (phòng, hàng chờ, timer, pub/sub); Postgres cho dữ liệu lâu dài.

## Hệ quả

- ➕ Làm việc với công cụ quen thuộc, debug nhanh, toàn quyền kiểm soát logic.
- ➖ Phải tự viết ghép trận, timer, ví/sổ cái, BXH (thêm ~1–2 tuần ở giai đoạn 2).
- ➖ Luật chơi tồn tại ở hai ngôn ngữ (TS và Python) → giảm rủi ro bằng **fixtures dùng chung** chạy trên cả hai bộ test.
