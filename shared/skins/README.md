# Skin

- **Chuẩn gói skin** (cho người và agent sinh skin): [`SPEC.md`](SPEC.md) + [`schema.json`](schema.json) (JSON Schema 2020-12, nguồn sự thật). Gói mẫu: [`_template/pen_example`](_template/pen_example), [`_template/box_example`](_template/box_example).
- **Seed trong repo chỉ còn hai skin default** (`pen/pen_default.json`, `box/box_default.json`, từ 2026-10-22): mọi skin khác là **tài nguyên nhập qua admin** (gói zip). Bản sao lưu 20 skin cũ nằm ở `_backup/` trên máy dev (gitignore): `okia-skins-backup-<ngày>.zip` nhập lại một phát, hoặc từng `<id>.okiaskin.zip`. Sáu skin cho test / smoke: `shared/fixtures/skins/test-skins.json`. Ý nghĩa trường: [`docs/08-skin.md`](../../docs/08-skin.md); quyết định: ADR-0013, ADR-0014.
- `pnpm gen:skins` (web/scripts/gen-skins.mjs) kiểm tra seed theo schema và sinh `api/app/skins/catalog.json`, `web/src/game/skins/catalog.data.ts`, chép schema sang `api/app/skins/schema.json`.
- `pnpm skin:pack <thư mục>` → `<id>.okiaskin.zip`; `pnpm skin:validate <thư mục | zip>` (web/scripts/skin-pack.mjs). Nhập gói ở trang `/admin` → tab Skin.
