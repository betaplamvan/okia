"""Skin dùng cho test shop / admin: seed trong repo chỉ còn hai skin default (ADR-0014, bổ sung
2026-10-22), các skin khác là tài nguyên nhập qua admin. shared/fixtures/skins/test-skins.json giữ 6
manifest (đủ bậc: dạ 250, mực tím 600, neon 1500, vàng 5 Hoa, Tô kín 100, Dấu sáp vàng) — test
nhập chúng qua POST /admin/skins/import (bảng `skins` không bị truncate giữa các test, nhập lại
chỉ ghi đè)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient
from starlette.testclient import TestClient

FIXTURE = Path(__file__).parents[2] / "shared" / "fixtures" / "skins" / "test-skins.json"
ADMIN_EMAIL = "admin@example.com"  # conftest: ADMIN_EMAILS


def fixture_manifests() -> list[dict[str, Any]]:
    return list(json.loads(FIXTURE.read_text(encoding="utf-8"))["skins"])


async def install_test_skins(client: AsyncClient, headers: dict[str, str] | None = None) -> None:
    """`headers`: token admin đang dùng — dev-login lại cùng email sẽ làm token cũ hết hiệu lực."""
    if headers is None:
        r = await client.post("/auth/dev-login", json={"email": ADMIN_EMAIL})
        assert r.status_code == 200, r.text
        client.cookies.clear()
        headers = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    r = await client.post(
        "/admin/skins/import", json={"skins": fixture_manifests()}, headers=headers
    )
    assert r.status_code == 200, r.text


def install_test_skins_sync(c: TestClient) -> None:
    r = c.post("/auth/dev-login", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200, r.text
    c.cookies.clear()
    headers = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    r = c.post("/admin/skins/import", json={"skins": fixture_manifests()}, headers=headers)
    assert r.status_code == 200, r.text
