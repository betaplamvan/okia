# Manifest skin

`<type>/<id>.json` với `<type>` ∈ `pen`, `box`. Định dạng manifest: [`docs/08-skin.md`](../../docs/08-skin.md); quy trình asset: [`docs/12-asset.md`](../../docs/12-asset.md).

`pnpm gen:skins` (web/scripts/gen-skins.mjs) kiểm tra manifest và sinh `api/app/skins/catalog.json` + `web/src/game/skins/catalog.data.ts` (ADR-0013: không có bảng items, không có asset ngoài — skin là tham số cho hiệu ứng có sẵn trong engine).
