"""Gói skin zip (shared/skins/SPEC.md, ADR-0014): kiểm tra manifest theo schema, giải nén an toàn,
nhập gói → asset lên storage + phục vụ qua /skins/assets, xuất gói / bundle nhập lại nguyên vẹn,
xóa / thay phiên bản dọn file cũ, manifest JSON giữ file của skin gói."""

import io
import json
import zipfile
from pathlib import Path

import pytest
from httpx import AsyncClient

from app import storage
from app.skins import catalog, package

pytestmark = pytest.mark.usefixtures("_clean")

TEMPLATE = Path(__file__).parents[2] / "shared" / "skins" / "_template"
SHARED = Path(__file__).parents[2] / "shared" / "skins"


def zip_dir(folder: Path, prefix: str = "") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for f in sorted(folder.rglob("*")):
            if f.is_file():
                zf.write(f, prefix + f.relative_to(folder).as_posix())
    return buf.getvalue()


def zip_of(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for k, v in files.items():
            zf.writestr(k, v)
    return buf.getvalue()


def manifest(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((TEMPLATE / name / "skin.json").read_text(encoding="utf-8"))  # type: ignore[no-any-return]


async def login(client: AsyncClient, email: str = "admin@example.com") -> dict[str, str]:
    r = await client.post("/auth/dev-login", json={"email": email})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}


# ---------- Thuần (không cần server) ----------


def test_schema_chep_khop_shared() -> None:
    """Sửa shared/skins/schema.json xong phải chạy `pnpm gen:skins` (chép sang api)."""
    assert package.schema() == json.loads((SHARED / "schema.json").read_text(encoding="utf-8"))


def test_moi_skin_trong_repo_hop_le_theo_schema() -> None:
    for t in catalog.TYPES:
        for f in sorted((SHARED / t).glob("*.json")):
            m = json.loads(f.read_text(encoding="utf-8"))
            package.validate_manifest(m, allow_default=True)
            assert package.refs(m) == []  # seed không có file đi kèm


def test_validate_manifest_loi_de_hieu() -> None:
    m = manifest("box_example")
    files = {"box/stamp.svg", "particles/shape.svg"}
    assert package.validate_manifest(m, files)["id"] == "box_example"
    with pytest.raises(package.PackageError, match="thiếu file box/stamp.svg"):
        package.validate_manifest(m, {"particles/shape.svg"})
    bad = {**m, "id": "pen_example"}
    with pytest.raises(package.PackageError, match="id phải bắt đầu bằng box_"):
        package.validate_manifest(bad, files)
    bad = {**m, "box": {**m["box"], "effect": "laser"}}
    with pytest.raises(package.PackageError, match="box/effect"):
        package.validate_manifest(bad, files)
    bad = {**m, "extra": 1}
    with pytest.raises(package.PackageError):
        package.validate_manifest(bad, files)
    with pytest.raises(package.PackageError, match="default"):
        package.validate_manifest({**m, "default": True}, files)
    pen = manifest("pen_example")
    pen["forms"]["opponent"]["color"] = pen["forms"]["mine"]["color"]
    with pytest.raises(package.PackageError, match="khác màu"):
        package.validate_manifest(pen, set(package.refs(pen)))
    # Tiếng có sẵn không cần file; tên lạ vẫn qua schema (client rơi về tiếng mặc định).
    pen = manifest("pen_example")
    pen["sfx"] = {"capture": "capture_bell", "combo": "combo_bell"}
    pen["pen"].pop("texture")
    pen["pen"].pop("textureScale")
    pen["combo"] = {"style": "ink", "particles": "ink", "shakeFrom": 2}
    package.validate_manifest(pen)


def test_parse_goi_mau_va_bundle() -> None:
    pkgs = package.parse(zip_dir(TEMPLATE / "pen_example"))
    assert [p.manifest["id"] for p in pkgs] == ["pen_example"]
    assert set(pkgs[0].files) == {
        "sfx/capture.webm",
        "sfx/combo.webm",
        "particles/shape.svg",
        "pen/texture.png",
    }
    # Zip cả thư mục (skin.json trong thư mục con) và bundle hai gói.
    assert package.parse(zip_dir(TEMPLATE / "box_example", "box_example/"))[0].folder == (
        "box_example"
    )
    both = zip_dir(TEMPLATE / "pen_example", "pen_example/") + b""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name in ("pen_example", "box_example"):
            for f in sorted((TEMPLATE / name).rglob("*")):
                if f.is_file():
                    zf.write(f, f"{name}/{f.relative_to(TEMPLATE / name).as_posix()}")
        zf.writestr("pen_example/README.md", "bỏ qua")
    pkgs = package.parse(buf.getvalue())
    assert sorted(p.manifest["id"] for p in pkgs) == ["box_example", "pen_example"]
    assert both  # (zip đơn vẫn parse được ở trên)
    # Phiên bản tất định theo nội dung.
    p = pkgs[0]
    assert package.version(p.manifest, p.files) == package.version(p.manifest, dict(p.files))


def test_parse_tu_choi_goi_hong() -> None:
    m = manifest("box_example")
    svg = (TEMPLATE / "box_example" / "box" / "stamp.svg").read_bytes()
    star = (TEMPLATE / "box_example" / "particles" / "shape.svg").read_bytes()
    ok = {"skin.json": json.dumps(m).encode(), "box/stamp.svg": svg, "particles/shape.svg": star}
    assert package.parse(zip_of(ok))[0].manifest["id"] == "box_example"
    cases: list[tuple[dict[str, bytes], str]] = [
        ({**ok, "box/stamp.svg": b"<svg><script>alert(1)</script></svg>"}, "script"),
        ({**ok, "box/stamp.svg": b"\x89PNG not really"}, "không đúng định dạng"),
        ({**ok, "particles/shape.svg": star, "sfx/x.png": svg}, "không nhận .png"),
        ({**ok, "../evil.svg": svg}, "đường dẫn không hợp lệ"),
        ({k: v for k, v in ok.items() if k != "box/stamp.svg"}, "thiếu file box/stamp.svg"),
        ({**ok, "box/extra.svg": svg}, "không được manifest dùng tới"),
        ({"skin.json": b"{not json"}, "không phải JSON"),
        ({"a/b/c.txt": b"x"}, "không thấy skin.json"),
        ({**ok, "box/stamp.svg": svg + b" " * (package.MAX_IMAGE + 1)}, "quá"),
    ]
    for files, msg in cases:
        with pytest.raises(package.PackageError, match=msg):
            package.parse(zip_of(files))
    with pytest.raises(package.PackageError, match="không phải file zip"):
        package.parse(b"hello")
    with pytest.raises(package.PackageError, match="MB"):
        package.parse(b"0" * (package.MAX_ZIP + 1))


# ---------- Qua API ----------


async def test_nhap_goi_phuc_vu_asset_xuat_lai(client: AsyncClient) -> None:
    admin = await login(client)
    data = zip_dir(TEMPLATE / "pen_example")
    # Xem trước: kiểm tra như nhập nhưng không ghi gì; báo skin mới / đã có.
    r = await client.post(
        "/admin/skins/preview-package", files={"file": ("p.zip", data)}, headers=admin
    )
    assert r.status_code == 200, r.text
    (pv,) = r.json()["skins"]
    assert pv["exists"] is False and pv["folder"] == "" and len(pv["files"]) == 4
    assert pv["files"][0] == {"path": "particles/shape.svg", "size": pv["files"][0]["size"]}
    assert catalog.get_skin("pen_example") is None
    r = await client.post(
        "/admin/skins/preview-package", files={"file": ("p.zip", b"xx")}, headers=admin
    )
    assert r.status_code == 400 and "zip" in r.json()["message"]
    r = await client.post(
        "/admin/skins/import-package",
        files={"file": ("pen_example.okiaskin.zip", data, "application/zip")},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    (out,) = r.json()
    assets = out["manifest"]["assets"]
    assert sorted(assets["files"]) == [
        "particles/shape.svg",
        "pen/texture.png",
        "sfx/capture.webm",
        "sfx/combo.webm",
    ]
    ver = assets["ver"]
    assert len(ver) == 10
    try:
        # Catalog public có assets.base trỏ về API; file tải được, immutable, đúng content-type.
        pub = next(s for s in (await client.get("/skins")).json() if s["id"] == "pen_example")
        base = pub["manifest"]["assets"]["base"]
        assert base.endswith(f"/skins/assets/pen_example/{ver}")
        assert pub["price"] == {"lead": 600}
        r = await client.get(f"/skins/assets/pen_example/{ver}/sfx/capture.webm")
        assert r.status_code == 200 and r.headers["content-type"].startswith("audio/webm")
        assert "immutable" in r.headers["cache-control"]
        assert r.content == (TEMPLATE / "pen_example/sfx/capture.webm").read_bytes()
        r = await client.get(f"/skins/assets/pen_example/{ver}/particles/shape.svg")
        assert r.status_code == 200 and "default-src 'none'" in r.headers["content-security-policy"]
        assert (await client.get(f"/skins/assets/pen_example/{ver}/sfx/nope.webm")).status_code == (
            404
        )
        assert (await client.get("/skins/assets/pen_example/zzz/sfx/capture.webm")).status_code == (
            404
        )
        # Xuất gói → nhập lại nguyên vẹn (cùng phiên bản, cùng file).
        r = await client.get("/admin/skins/pen_example/package", headers=admin)
        assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
        assert "pen_example.okiaskin.zip" in r.headers["content-disposition"]
        again = package.parse(r.content, allow_default=True)[0]
        assert "assets" not in again.manifest
        assert again.manifest["name"] == manifest("pen_example")["name"]
        assert package.version(again.manifest, again.files) == ver
        # Export JSON (một skin / tất cả) không mang `assets`.
        one = (await client.get("/admin/skins/pen_example/export", headers=admin)).json()
        assert "assets" not in one and one["sfx"]["capture"] == "sfx/capture.webm"
        allj = (await client.get("/admin/skins/export?format=json", headers=admin)).json()
        assert all("assets" not in m for m in allj["skins"])
        # Bundle: mọi skin trong DB, mỗi thư mục một gói; gói mẫu còn đủ file.
        r = await client.get("/admin/skins/export", headers=admin)
        assert r.status_code == 200
        pkgs = package.parse(r.content, allow_default=True)
        ids = {p.manifest["id"] for p in pkgs}
        assert "pen_default" in ids and "pen_example" in ids
        assert set(next(p for p in pkgs if p.manifest["id"] == "pen_example").files) == set(
            assets["files"]
        )
        # Sửa metadata giữ file; sửa manifest JSON (không file) của skin gói cũng giữ file.
        r = await client.patch("/admin/skins/pen_example", json={"rarity": "epic"}, headers=admin)
        assert r.status_code == 200 and r.json()["manifest"]["assets"]["ver"] == ver
        m = package.portable(r.json()["manifest"])
        m["pen"]["width"] = 2
        r = await client.put("/admin/skins/pen_example", json={"manifest": m}, headers=admin)
        assert r.status_code == 200, r.text
        assert r.json()["manifest"]["assets"]["ver"] == ver
        assert r.json()["manifest"]["pen"]["width"] == 2
        # Manifest JSON tham chiếu file mà skin chưa có → từ chối, nêu tên file.
        m["id"] = "pen_example2"
        r = await client.put("/admin/skins/pen_example2", json={"manifest": m}, headers=admin)
        assert r.status_code == 400 and "thiếu file" in r.json()["message"]
        # Nhập lại gói với file khác → phiên bản mới, file cũ bị dọn.
        folder = TEMPLATE / "pen_example"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for f in sorted(folder.rglob("*")):
                if f.is_file():
                    zf.write(f, f.relative_to(folder).as_posix())
            zf.writestr("particles/shape.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>')
        r = await client.post(
            "/admin/skins/import-package",
            files={"file": ("p.zip", buf.getvalue(), "application/zip")},
            headers=admin,
        )
        assert r.status_code == 200, r.text
        ver2 = r.json()[0]["manifest"]["assets"]["ver"]
        assert ver2 != ver
        # Xem trước gói đã có → exists, và vẫn không ghi gì (phiên bản giữ nguyên).
        r = await client.post(
            "/admin/skins/preview-package", files={"file": ("p.zip", data)}, headers=admin
        )
        assert r.status_code == 200 and r.json()["skins"][0]["exists"] is True
        assert catalog.get_skin("pen_example").manifest["assets"]["ver"] == ver2  # type: ignore[union-attr]
        st = storage.get_storage()
        assert await st.get(package.storage_key("pen_example", ver, "sfx/capture.webm")) is None
        assert await st.get(package.storage_key("pen_example", ver2, "sfx/capture.webm"))
        assert catalog.get_skin("pen_example").manifest["assets"]["ver"] == ver2  # type: ignore[union-attr]
    finally:
        r = await client.delete("/admin/skins/pen_example", headers=admin)
        assert r.status_code == 200
    assert catalog.get_skin("pen_example") is None
    st = storage.get_storage()
    for f in assets["files"]:
        assert await st.get(package.storage_key("pen_example", ver, f)) is None


async def test_nhap_goi_hong_va_bao_ve_default(client: AsyncClient) -> None:
    admin = await login(client)
    user = await login(client, "thuong@example.com")
    data = zip_dir(TEMPLATE / "box_example")
    r = await client.post(
        "/admin/skins/import-package", files={"file": ("x.zip", data)}, headers=user
    )
    assert r.status_code == 403
    # Lỗi nêu rõ nguyên nhân trong message.
    m = manifest("box_example")
    bad = zip_of({"skin.json": json.dumps(m).encode()})
    r = await client.post(
        "/admin/skins/import-package", files={"file": ("x.zip", bad)}, headers=admin
    )
    assert r.status_code == 400 and r.json()["code"] == "BAD_SKIN"
    assert "box/stamp.svg" in r.json()["message"]
    assert catalog.get_skin("box_example") is None
    # Gói nhận là default mới → từ chối (chỉ seed); ghi đè default bằng bản thường → 409.
    d = {**m, "id": "box_default", "default": True}
    files = {
        "skin.json": json.dumps(d).encode(),
        "box/stamp.svg": (TEMPLATE / "box_example/box/stamp.svg").read_bytes(),
        "particles/shape.svg": (TEMPLATE / "box_example/particles/shape.svg").read_bytes(),
    }
    r = await client.post(
        "/admin/skins/import-package", files={"file": ("x.zip", zip_of(files))}, headers=admin
    )
    assert r.status_code == 200, r.text  # ghi đè default bằng bản default: được
    assert catalog.get_skin("box_default").manifest["box"]["effect"] == "image"  # type: ignore[union-attr]
    files["skin.json"] = json.dumps({**m, "id": "box_default"}).encode()
    r = await client.post(
        "/admin/skins/import-package", files={"file": ("x.zip", zip_of(files))}, headers=admin
    )
    assert r.status_code == 409
    files["skin.json"] = json.dumps({**m, "id": "box_moi", "default": True}).encode()
    r = await client.post(
        "/admin/skins/import-package", files={"file": ("x.zip", zip_of(files))}, headers=admin
    )
    assert r.status_code == 400
    # Trả default về bản seed cho test khác.
    seed = next(s for s in catalog.seed_manifests() if s["id"] == "box_default")
    r = await client.put("/admin/skins/box_default", json={"manifest": seed}, headers=admin)
    assert r.status_code == 200, r.text
