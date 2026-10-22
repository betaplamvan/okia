# Skin

- **Chuẩn gói skin** (cho người và agent sinh skin): [`SPEC.md`](SPEC.md) + [`schema.json`](schema.json) (JSON Schema 2020-12, nguồn sự thật). Gói mẫu: [`_template/pen_example`](_template/pen_example), [`_template/box_example`](_template/box_example).
- **Seed trong repo:** `<type>/<id>.json` với `<type>` ∈ `pen`, `box` — manifest thuần, không tham chiếu file. Ý nghĩa trường: [`docs/08-skin.md`](../../docs/08-skin.md); quyết định: ADR-0013, ADR-0014.
- `pnpm gen:skins` (web/scripts/gen-skins.mjs) kiểm tra seed theo schema và sinh `api/app/skins/catalog.json`, `web/src/game/skins/catalog.data.ts`, chép schema sang `api/app/skins/schema.json`.
- `pnpm skin:pack <thư mục>` → `<id>.okiaskin.zip`; `pnpm skin:validate <thư mục | zip>` (web/scripts/skin-pack.mjs). Nhập gói ở trang `/admin` → tab Skin.
