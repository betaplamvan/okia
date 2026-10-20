# ADR-0008 — CI/CD bằng GitHub Actions, triển khai trên minisforum

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận (thay phần "Triển khai" của [02](../02-kien-truc.md#triển-khai) ở giai đoạn hiện tại)

## Bối cảnh

Kế hoạch cũ ([02](../02-kien-truc.md#triển-khai), P1-21): một VPS chạy Docker Compose gồm `caddy`, `web`,
`api`, `postgres`, `redis`. Người phát triển đã có máy minisforum chạy sẵn Postgres/Redis, và đã dùng mẫu
"build trên GitHub → push GHCR → self-hosted runner pull về chạy" ở dự án QHome. Repo okia là private nên
phút chạy runner GitHub có giới hạn.

## Quyết định

- Hai workflow tách theo đường dẫn: `web.yml` (web/, shared/) và `api.yml` (api/, shared/fixtures/). Đổi
  một phía không build/deploy phía kia.
- Build (lint, test, image Docker) **ưu tiên `ubuntu-latest`**; job đó không khởi động được (hết quota) thì
  build lại trên runner **minisforum**. Deploy luôn trên minisforum.
- Image lưu trên **GHCR**, tag theo commit sha; container thay bằng `deploy/deploy-container.sh` (chờ
  healthcheck, lỗi thì chạy lại image cũ).
- **Postgres/Redis không do CI/CD tạo** — dùng bản có sẵn trên minisforum, truyền URL qua secret của
  Environment `production`. Container `api` chạy `alembic upgrade head` khi khởi động.

Chi tiết cấu hình: [deploy/README.md](../../deploy/README.md).

## Phương án đã loại

- **Compose đầy đủ trên VPS (kế hoạch cũ):** tốn thêm tiền thuê VPS khi đã có máy riêng; giữ lại làm hướng
  đi khi cần chuyển lên VPS.
- **Build hoàn toàn trên minisforum:** không tốn quota nhưng chiếm tài nguyên máy đang phục vụ người chơi;
  dùng làm dự phòng thay vì mặc định.
- **Một workflow chung với `dorny/paths-filter`:** cùng hiệu quả, nhưng hai file riêng dễ đọc và chạy tay
  từng phía hơn.

## Hệ quả

- ➕ Không tốn phí hạ tầng; đổi FE không làm gián đoạn BE và ngược lại; lỗi deploy tự quay về bản cũ.
- ➖ Uptime phụ thuộc máy và mạng nhà; HTTPS/reverse proxy và backup (P1-22) còn phải làm riêng.
- ➖ Khi dùng dự phòng, workflow hiển thị một job GitHub đỏ (job không nhận được runner) dù tổng thể thành công.
