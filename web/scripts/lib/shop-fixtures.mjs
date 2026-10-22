// Skin cho smoke shop / admin: seed chỉ còn hai skin default (ADR-0014, 2026-10-22), nên smoke
// nhập 6 skin từ shared/fixtures/skins/test-skins.json qua API admin (dev-login email trong api/.env
// ADMIN_EMAILS) trước khi mở trang. Nhập lại chỉ ghi đè, vô hại.
import { readFileSync } from "node:fs";

export const ADMIN_EMAIL = "ducquank52t1@gmail.com";

export async function ensureShopSkins(apiBase) {
  const { skins } = JSON.parse(
    readFileSync(
      new URL("../../../shared/fixtures/skins/test-skins.json", import.meta.url),
      "utf8",
    ),
  );
  const login = await fetch(`${apiBase}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  if (!login.ok) throw new Error(`dev-login admin → ${login.status}`);
  const { accessToken } = await login.json();
  const r = await fetch(`${apiBase}/admin/skins/import`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ skins, replace: false }),
  });
  if (!r.ok) throw new Error(`import skin fixture → ${r.status} ${await r.text()}`);
  return skins.map((s) => s.id);
}
