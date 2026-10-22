"""Ủng hộ (docs/10 — Donate): webhook SePay ghi giao dịch, bóc tên hoặc mã tài khoản từ nội
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
    # Khách / chưa đăng nhập: không thấy tài khoản nhận, không có mã (bắt buộc liên kết Google).
    pub = (await client.get("/donate")).json()
    assert pub["bank"] is None and pub["myCode"] is None and pub["supporters"] == []
    # Tài khoản đã liên kết: thấy tài khoản nhận + mã; ủng hộ với mã → mạnh thường quân (avatar +
    # tên tài khoản), tô "bạn", bỏ quảng cáo vĩnh viễn + Trống Đồng (adFree).
    r = await client.post("/auth/dev-login", json={"email": "ung-ho@example.com"})
    tok = r.json()["accessToken"]
    client.cookies.clear()
    h = {"Authorization": f"Bearer {tok}"}
    me = (await client.get("/me", headers=h)).json()
    assert me["adFree"] is False
    info = (await client.get("/donate", headers=h)).json()
    assert info["bank"]["bin"] == "970422" and info["bank"]["accountNo"] == "0123456789"
    assert info["myCode"] and len(info["myCode"]) == 6
    r = await client.post(
        "/donate/webhook/sepay",
        json=sepay_tx(4, f"MBVCB.9.OKIA {info['myCode']}.CT tu"),
        headers=SEPAY,
    )
    assert r.status_code == 200 and r.json() == {"success": True}
    info = (await client.get("/donate", headers=h)).json()
    assert info["count"] == 1  # chỉ tài khoản có mã; "An" ghi tên tự do không lên bảng
    assert [(x["name"], x["mine"]) for x in info["supporters"]] == [(me["displayName"], True)]
    assert "avatarUrl" in info["supporters"][0] and "amount" not in info["supporters"][0]
    assert (await client.get("/me", headers=h)).json()["adFree"] is True
    # Ủng hộ lần hai: vẫn một dòng.
    r = await client.post(
        "/donate/webhook/sepay", json=sepay_tx(5, f"OKIA {info['myCode']}"), headers=SEPAY
    )
    assert r.status_code == 200
    info = (await client.get("/donate")).json()
    assert (
        info["count"] == 1
        and len(info["supporters"]) == 1
        and info["supporters"][0]["mine"] is False
    )


async def test_admin_dat_ten_va_an(client: AsyncClient) -> None:
    r = await client.post("/auth/dev-login", json={"email": "alice@example.com"})
    tok = r.json()["accessToken"]
    client.cookies.clear()
    code = (await client.get("/donate", headers={"Authorization": f"Bearer {tok}"})).json()[
        "myCode"
    ]
    r = await client.post("/donate/webhook/sepay", json=sepay_tx(11, f"OKIA {code}"), headers=SEPAY)
    assert r.status_code == 200
    r = await client.post(
        "/donate/webhook/sepay", json=sepay_tx(12, "chuyen khoan", 30000), headers=SEPAY
    )
    assert r.status_code == 200
    pub = (await client.get("/donate")).json()
    assert len(pub["supporters"]) == 1 and pub["count"] == 1

    # Admin: thấy số tiền, đặt tên cho giao dịch ẩn danh, ẩn một giao dịch.
    r = await client.post("/auth/dev-login", json={"email": "admin@example.com"})
    admin = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    client.cookies.clear()
    assert (await client.get("/admin/donations")).status_code == 401
    page = (await client.get("/admin/donations", headers=admin)).json()
    assert page["total"] == 2 and page["sumVnd"] == 50000
    anon = next(i for i in page["items"] if i["userId"] is None)
    assert anon["amount"] == 30000 and anon["currency"] == "VND"
    r = await client.patch(
        f"/admin/donations/{anon['id']}", json={"donorName": "Bob"}, headers=admin
    )
    assert r.status_code == 200 and r.json()["donorName"] == "Bob"
    alice = next(i for i in page["items"] if i["userId"] is not None)
    r = await client.patch(f"/admin/donations/{alice['id']}", json={"hidden": True}, headers=admin)
    assert r.json()["hidden"] is True
    pub = (await client.get("/donate")).json()
    assert pub["supporters"] == [] and pub["count"] == 0
