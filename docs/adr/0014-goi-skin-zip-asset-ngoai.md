# ADR-0014 — Gói skin `.okiaskin.zip`: manifest + ảnh + tiếng, nhập ở admin, không code

- **Ngày:** 2026-10-22
- **Trạng thái:** chấp nhận (thay điểm 3 "100 % thủ tục, không asset ngoài" của [ADR-0013](0013-skin-but-o-nam-bac-hiem.md); catalog trong DB giữ nguyên)

## Bối cảnh

ADR-0013 chọn skin = JSON tham số cho hiệu ứng viết sẵn trong engine; tiếng nằm trong audio sprite
build sẵn. Hệ quả: "thêm skin không cần deploy" chỉ đúng khi tái tổ hợp style / effect / tiếng đã
có; một tiếng mới hay một hình mới đều phải sửa code và deploy web. Đặc tả manifest rải ở ba nơi
(docs/08, gen-skins.mjs, kiểu TypeScript) nên công cụ sinh skin (agent) khó nắm.

Người phát triển muốn: sửa / thêm / bỏ skin nhanh; **upload một zip** chứa đủ manifest, hiệu
ứng, âm thanh; chuẩn rõ để agent tự sinh gói; việc còn lại là nhập gói đúng chuẩn.

## Quyết định

1. **Gói skin** `<id>.okiaskin.zip` = `skin.json` + file tùy chọn: `sfx/*.webm|mp3|ogg`,
   `box/*.svg|png|webp`, `particles/*.svg|png|webp`, `pen/*.png|webp|svg`. Một zip có thể là
   **bundle** nhiều thư mục (mỗi thư mục một gói) — đây cũng là định dạng "Xuất tất cả".
   Đặc tả: [`shared/skins/SPEC.md`](../../shared/skins/SPEC.md); nguồn sự thật cấu trúc:
   [`shared/skins/schema.json`](../../shared/skins/schema.json) (JSON Schema 2020-12), dùng chung
   bởi `gen-skins.mjs` (ajv), API (`jsonschema`) và test hai phía. Gói mẫu: `shared/skins/_template/`.
2. **Hiệu ứng vẫn là dữ liệu, không bao giờ là code.** Engine thêm ba primitive nhận ảnh:
   `box.effect: "image"` (ảnh in vào ô, nhuộm màu bút trừ khi `tint: false`), `particles: "image"`
   (ảnh vụn `particleImage`), `pen.texture` (ảnh lặp phủ nét, nhuộm màu hình thái). Tiếng:
   `sfx.capture` / `sfx.combo` nhận tên trong sprite **hoặc** file trong gói. Zip có JS/shader
   bị từ chối — không chạy code lạ trong trình duyệt người chơi.
3. **Lưu trữ:** file lên object storage (MinIO, như ảnh đại diện) dưới
   `skins/{id}/{ver}/{path}`, `ver` = băm nội dung (10 hex) → URL bất biến, API phục vụ qua
   `GET /skins/assets/{id}/{ver}/{path}` với `Cache-Control: immutable` (Cloudflare cache).
   Manifest trong DB mang `assets {ver, files}`; `/skins` gắn thêm `assets.base` cho client.
   SVG trả kèm CSP `default-src 'none'` và bị từ chối khi chứa script / tham chiếu ngoài.
4. **Nhập / xuất ở admin:** `POST /admin/skins/import-package` (multipart zip, một gói hoặc
   bundle; kiểm tra hết rồi mới ghi; phiên bản cũ dọn sau khi DB đổi), `GET /admin/skins/{id}/package`
   (zip), `GET /admin/skins/export` (bundle zip; `?format=json` chỉ manifest). Nhập JSON thuần
   giữ như cũ; manifest JSON tham chiếu file chỉ hợp lệ khi skin ấy đã là gói trong DB (giữ file).
   Trùng id → ghi đè; skin `default` chỉ được ghi đè bằng bản `default` (không tắt / không mất).
5. **Công cụ:** `pnpm skin:pack <thư mục>` / `pnpm skin:validate <thư mục | zip>` (cùng quy tắc,
   cùng thông điệp lỗi với API). Seed trong repo (`shared/skins/<type>/<id>.json`) vẫn là manifest
   thuần, **không** tham chiếu file — skin có file đi theo đường gói ở admin.

## Hệ quả

- (+) Thêm skin có tiếng và hình riêng = một zip, không deploy; agent có schema + SPEC + gói mẫu
  để sinh đúng chuẩn và tự kiểm tra bằng CLI trước khi gửi.
- (+) Engine giữ quyền kiểm soát hiệu năng: ảnh có trần kích thước (300 KB) và tiếng (400 KB),
  tối đa 24 file / 3 MB một zip; render vẫn qua các builder có sẵn.
- (−) Ảnh trong gói không có "hiệu ứng sống" (ticker) — chỉ animation hiện; muốn hiệu ứng mới
  vẫn phải thêm primitive trong engine.
- (−) Thêm một chỗ phụ thuộc object storage (dev không có S3 → MemoryStorage, mất khi restart;
  production bắt buộc MinIO như ảnh đại diện).
- Chưa làm: font, nhạc nền, skin bàn trong gói; xem trước ảnh `preview.png` trên thẻ shop.

## Bổ sung 2026-10-22: seed chỉ còn skin default

Repo chỉ giữ hai manifest default làm seed (catalog luôn có mặc định); 20 skin ban đầu được gỡ khỏi seed, sao lưu ở `shared/skins/_backup/` (gitignore) và từ nay là tài nguyên nhập qua admin như mọi gói khác. Lý do: seed chèn lại skin thiếu mỗi lần API khởi động, nên muốn "xóa trên prod" phải gỡ khỏi seed; và hướng mới là mọi skin đi qua admin, không qua deploy. Kèm theo: `POST /admin/skins/purge` (xóa tất cả trừ mặc định, giữ `inventory`), tùy chọn "thay toàn bộ catalog" khi nhập gói, fixture `shared/fixtures/skins/test-skins.json` cho test / smoke.
