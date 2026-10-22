"""Ủng hộ (docs/10 — Donate): webhook SePay / Ko-fi ghi giao dịch, bóc tên hoặc mã tài khoản từ nội
dung, bỏ qua tiền ra / trùng / sai key; GET /donate chỉ trả tên + tháng (không số tiền); admin
đặt tên / ẩn."""

import pytest
from httpx import AsyncClient

from app.donate import service

pytestmark = pytest.mark.usefixtures("_clean")
SEPAY = {"Authorization": "Apikey test-sepay-key"}  # conftest


def sepay_tx(tx_id: int, content: str, amount: int = 20000, kind: str = "in") -> dict:  # type: ignore[type-arg]
    return {
        "id": tx_id,
        "gateway": "MBBank",
        "transactionDate": "2026-10-23 10:15:00",
        "accountNumber": "0123456789",
        "code": None,
        "content": content,
        "transferType": kind,
        "transferAmount": amount,
        "accumulated": 0,
        "subAccount": None,
        "referenceCode": f"FT{tx_id}",
        "description": content,
    }


def test_bo_ten_va_ma() -> None:
    assert service.parse_content("MBVCB.123.OKIA Be Na.CT tu 0123") == (None, "Be Na")
    assert service.parse_content("okia-quan") == (None, "quan")
    assert service.parse_content("OKIA 7F3A2C") == ("7F3A2C", None)
    assert service.parse_content("chuyen tien") == (None, None)
    assert service.clean_name("  a\tb   c  ") == "a b c"
    assert service.clean_name("x" * 40) == "x" * 24


async def test_webhook_sepay_va_bang_cam_on(client: AsyncClient) -> None:
    # Sai key / không key → 403.
    r = await client.post("/donate/webhook/sepay", json=sepay_tx(1, "OKIA An"))
    assert r.status_code == 403
    r = await client.post(
        "/donate/webhook/sepay", json=sepay_tx(1, "OKIA An"), headers={"Authorization": "Apikey x"}
    )
    assert r.status_code == 403
    # Tiền vào có tên → ghi; tiền ra → bỏ qua; gửi lại cùng id → trùng, không ghi thêm.
    r = await client.post("/donate/webhook/sepay", json=sepay_tx(1, "OKIA An"), headers=SEPAY)
    assert r.status_code == 200 and r.json() == {"success": True}
    r = await client.post(
        "/donate/webhook/sepay", json=sepay_tx(2, "OKIA Binh", kind="out"), headers=SEPAY
    )
    assert r.json().get("ignored") is True
    r = await client.post("/donate/webhook/sepay", json=sepay_tx(1, "OKIA An"), headers=SEPAY)
    assert r.json().get("duplicate") is True
    # Không có mẫu OKIA → ghi nhưng ẩn danh (không lên bảng cảm ơn).
    r = await client.post(
        "/donate/webhook/sepay", json=sepay_tx(3, "chuyen khoan", 50000), headers=SEPAY
    )
    assert r.status_code == 200
    # Người đã đăng nhập ghi mã tài khoản → lấy tên hiển thị, tô "bạn".
    r = await client.post("/auth/dev-login", json={"email": "ung-ho@example.com"})
    tok = r.json()["accessToken"]
    client.cookies.clear()
    me = (await client.get("/me", headers={"Authorization": f"Bearer {tok}"})).json()
    info = (await client.get("/donate", headers={"Authorization": f"Bearer {tok}"})).json()
    assert info["myCode"] and len(info["myCode"]) == 6
    r = await client.post(
        "/donate/webhook/sepay",
        json=sepay_tx(4, f"MBVCB.9.OKIA {info['myCode']}.CT tu"),
        headers=SEPAY,
    )
    assert r.status_code == 200 and r.json() == {"success": True}

    info = (await client.get("/donate", headers={"Authorization": f"Bearer {tok}"})).json()
    assert info["bank"]["bin"] == "970422" and info["bank"]["accountNo"] == "0123456789"
    assert info["count"] == 3  # An, ẩn danh, mã
    names = [(t["name"], t["mine"]) for t in info["thanks"]]
    assert (me["displayName"], True) in names and ("An", False) in names
    assert all("amount" not in t for t in info["thanks"])
    # Khách: không có myCode, không "mine".
    pub = (await client.get("/donate")).json()
    assert pub["myCode"] is None and not any(t["mine"] for t in pub["thanks"])


async def test_webhook_kofi_va_admin(client: AsyncClient) -> None:
    kofi = {
        "verification_token": "test-kofi-token",
        "message_id": "m1",
        "timestamp": "2026-10-23T03:00:00Z",
        "type": "Donation",
        "from_name": "Alice",
        "message": "go go",
        "amount": "3.00",
        "currency": "USD",
        "is_public": True,
        "kofi_transaction_id": "k-1",
    }
    import json

    r = await client.post(
        "/donate/webhook/kofi", data={"data": json.dumps({**kofi, "verification_token": "x"})}
    )
    assert r.status_code == 403
    r = await client.post("/donate/webhook/kofi", data={"data": json.dumps(kofi)})
    assert r.status_code == 200 and r.json() == {"success": True}
    r = await client.post(
        "/donate/webhook/kofi",
        data={"data": json.dumps({**kofi, "kofi_transaction_id": "k-2", "is_public": False})},
    )
    assert r.status_code == 200
    pub = (await client.get("/donate")).json()
    assert [t["name"] for t in pub["thanks"]] == ["Alice"] and pub["count"] == 2

    # Admin: thấy số tiền, đặt tên cho giao dịch ẩn danh, ẩn một giao dịch.
    r = await client.post("/auth/dev-login", json={"email": "admin@example.com"})
    admin = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    client.cookies.clear()
    assert (await client.get("/admin/donations")).status_code == 401
    page = (await client.get("/admin/donations", headers=admin)).json()
    assert page["total"] == 2 and page["sumVnd"] == 0
    anon = next(i for i in page["items"] if i["donorName"] is None)
    assert anon["amount"] == 300 and anon["currency"] == "USD"
    r = await client.patch(
        f"/admin/donations/{anon['id']}", json={"donorName": "Bob"}, headers=admin
    )
    assert r.status_code == 200 and r.json()["donorName"] == "Bob"
    alice = next(i for i in page["items"] if i["donorName"] == "Alice")
    r = await client.patch(f"/admin/donations/{alice['id']}", json={"hidden": True}, headers=admin)
    assert r.json()["hidden"] is True
    pub = (await client.get("/donate")).json()
    assert [t["name"] for t in pub["thanks"]] == ["Bob"] and pub["count"] == 1
