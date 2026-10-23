"""Gói skin `<id>.okiaskin.zip` (shared/skins/SPEC.md, ADR-0014).

- `validate_manifest(raw, files)`: kiểm tra manifest theo shared/skins/schema.json (bản chép
  app/skins/schema.json) + ràng buộc ngoài schema (tiền tố id theo loại, hai hình thái khác màu,
  mọi tham chiếu asset có file trong gói, default chỉ dành cho seed).
- `parse(data)`: giải nén an toàn → danh sách Package (một gói hoặc bundle nhiều thư mục).
  Giới hạn kích thước, tên file, thư mục theo loại, chữ ký file, SVG không có script.
- `build(manifest, files)`: zip một skin; `build_bundle([...])`: zip nhiều thư mục.
- `version(manifest, files)`: mã 10 hex tất định theo nội dung → khóa storage bất biến.

Lưu trữ: object storage (app/storage.py) dưới `skins/{id}/{ver}/{path}`; API phục vụ qua
GET /skins/assets/{id}/{ver}/{path} với Cache-Control immutable (CDN cache thoải mái).
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

MAX_ZIP = 3 * 1024 * 1024
MAX_FILES = 24
MAX_AUDIO = 400 * 1024
MAX_IMAGE = 300 * 1024
ASSET_RE = re.compile(
    r"^(sfx|box|particles|pen|throw)/[a-z0-9_\-]{1,40}\.(webm|mp3|ogg|svg|png|webp)$"
)
DIR_EXTS = {
    "sfx": {"webm", "mp3", "ogg"},
    "box": {"svg", "png", "webp"},
    "particles": {"svg", "png", "webp"},
    "pen": {"svg", "png", "webp"},
    "throw": {"svg", "png", "webp"},
}
MEDIA_TYPES = {
    "webm": "audio/webm",
    "mp3": "audio/mpeg",
    "ogg": "audio/ogg",
    "svg": "image/svg+xml",
    "png": "image/png",
    "webp": "image/webp",
}
# File tùy chọn ở gốc gói, bỏ qua khi nhập.
IGNORED = {"readme.md", "license", "license.md", "license.txt", "preview.png", "preview.webp"}
SVG_FORBIDDEN = re.compile(
    r"<script|\bon[a-z]+\s*=|javascript:|<foreignobject|<!entity|<iframe|<embed|<object"
    r"|href\s*=\s*[\"'](?!#)",
    re.IGNORECASE,
)
# Tham chiếu asset trong manifest: đường dẫn trỏ tới đâu (để kiểm tra và để client phân giải).
REF_PATHS: tuple[tuple[str, str], ...] = (
    ("pen", "texture"),
    ("combo", "particleImage"),
    ("box", "image"),
    ("box", "particleImage"),
    ("throw", "image"),
    ("sfx", "capture"),
    ("sfx", "combo"),
)


class PackageError(ValueError):
    """Gói / manifest không hợp lệ; `detail` ngắn gọn để hiện cho admin."""


@lru_cache
def schema() -> dict[str, Any]:
    return json.loads(  # type: ignore[no-any-return]
        (Path(__file__).with_name("schema.json")).read_text(encoding="utf-8")
    )


@lru_cache
def _validator() -> Draft202012Validator:
    return Draft202012Validator(schema())


def refs(manifest: dict[str, Any]) -> list[str]:
    """Mọi tham chiếu file trong gói (`thư_mục/tên.ext`) mà manifest dùng, theo thứ tự xuất hiện."""
    out: list[str] = []
    for block, key in REF_PATHS:
        v = (manifest.get(block) or {}).get(key) if isinstance(manifest.get(block), dict) else None
        if isinstance(v, str) and ASSET_RE.match(v) and v not in out:
            out.append(v)
    return out


def validate_manifest(
    raw: dict[str, Any], files: set[str] | None = None, *, allow_default: bool = False
) -> dict[str, Any]:
    """Trả về manifest đã kiểm tra (bản sao). `files`: tên file có trong gói (None = không có file
    nào, chỉ chấp nhận tiếng có sẵn). Ném PackageError với mô tả ngắn."""
    if not isinstance(raw, dict):
        raise PackageError("manifest phải là một object JSON")
    err = next(iter(sorted(_validator().iter_errors(raw), key=lambda e: list(e.path))), None)
    if err is not None:
        where = "/".join(str(p) for p in err.path) or "(gốc)"
        raise PackageError(f"{where}: {err.message[:160]}")
    m: dict[str, Any] = json.loads(json.dumps(raw))
    if not m["id"].startswith(m["type"] + "_"):
        raise PackageError(f"id phải bắt đầu bằng {m['type']}_")
    if m.get("default") and not allow_default:
        raise PackageError("gói nhập từ ngoài không được đặt default")
    if m["type"] == "pen":
        a = m["forms"]["mine"]["color"].lower()
        b = m["forms"]["opponent"]["color"].lower()
        if a == b:
            raise PackageError("forms.mine và forms.opponent phải khác màu chính")
    have = files if files is not None else set()
    for ref in refs(m):
        if ref not in have:
            raise PackageError(f"thiếu file {ref} trong gói")
    return m


@dataclass
class Package:
    manifest: dict[str, Any]
    files: dict[str, bytes] = field(default_factory=dict)
    # Thư mục chứa trong zip ("" = gốc) — để báo lỗi dễ hiểu.
    folder: str = ""


def _sniff(path: str, data: bytes) -> None:
    ext = path.rsplit(".", 1)[1]
    head = data[:16]
    ok = True
    if ext == "png":
        ok = head.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext == "webp":
        ok = head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    elif ext == "svg":
        text = data[:4096].decode("utf-8", "replace").lower()
        ok = "<svg" in text
        if ok and SVG_FORBIDDEN.search(data.decode("utf-8", "replace")):
            raise PackageError(f"{path}: SVG chứa script / tham chiếu ngoài")
    elif ext == "webm":
        ok = head.startswith(b"\x1a\x45\xdf\xa3")
    elif ext == "mp3":
        sync = len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0
        ok = head.startswith(b"ID3") or sync
    elif ext == "ogg":
        ok = head.startswith(b"OggS")
    if not ok:
        raise PackageError(f"{path}: nội dung không đúng định dạng {ext}")
    limit = MAX_AUDIO if ext in DIR_EXTS["sfx"] else MAX_IMAGE
    if len(data) > limit:
        raise PackageError(f"{path}: quá {limit // 1024} KB")


def _read_capped(zf: zipfile.ZipFile, info: zipfile.ZipInfo, cap: int) -> bytes:
    """Đọc một entry nhưng không quá `cap` byte sau giải nén (zip khai gian kích thước / zip bomb
    không làm phình bộ nhớ); quá trần → PackageError."""
    try:
        with zf.open(info) as f:
            data = f.read(cap + 1)
    except (zipfile.BadZipFile, RuntimeError, OSError) as e:
        raise PackageError(f"{info.filename}: không đọc được ({type(e).__name__})") from e
    if len(data) > cap:
        raise PackageError(f"{info.filename}: quá {cap // 1024} KB")
    return data


def _check_path(rel: str) -> str:
    """Đường dẫn trong một gói (sau khi bỏ thư mục chứa): asset đúng chuẩn hoặc file bỏ qua."""
    if rel.lower() in IGNORED:
        return ""
    if not ASSET_RE.match(rel):
        raise PackageError(f"tên file không hợp lệ: {rel}")
    folder, ext = rel.split("/")[0], rel.rsplit(".", 1)[1]
    if ext not in DIR_EXTS[folder]:
        raise PackageError(f"{rel}: thư mục {folder}/ không nhận .{ext}")
    return rel


def parse(data: bytes, *, allow_default: bool = False) -> list[Package]:
    """Giải nén và kiểm tra. Một `skin.json` ở gốc → một gói; không thì mỗi thư mục cấp 1 có
    `skin.json` là một gói (bundle). Mọi file khác phải thuộc một gói và được manifest tham
    chiếu."""
    if len(data) > MAX_ZIP:
        raise PackageError(f"zip quá {MAX_ZIP // 1024 // 1024} MB")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
        infos = [i for i in zf.infolist() if not i.is_dir()]
    except zipfile.BadZipFile as e:
        raise PackageError("không phải file zip") from e
    names: dict[str, zipfile.ZipInfo] = {}
    total = 0
    for i in infos:
        n = i.filename.replace("\\", "/")
        if n.startswith("__MACOSX/") or n.rsplit("/", 1)[-1] in (".DS_Store", "Thumbs.db"):
            continue
        if n.startswith("/") or ".." in n.split("/") or ":" in n:
            raise PackageError(f"đường dẫn không hợp lệ: {n}")
        total += i.file_size
        if total > MAX_ZIP * 2:
            raise PackageError("nội dung giải nén quá lớn")
        names[n] = i
    if len(names) > (MAX_FILES + 1) * 12:
        raise PackageError("quá nhiều file")
    roots: dict[str, dict[str, zipfile.ZipInfo]] = {}
    if "skin.json" in names:
        roots[""] = names
    else:
        for n in names:
            parts = n.split("/")
            if len(parts) == 2 and parts[1] == "skin.json":
                roots[parts[0]] = {}
        if not roots:
            raise PackageError("không thấy skin.json (ở gốc zip hoặc trong thư mục cấp 1)")
        for n, info in names.items():
            top = n.split("/", 1)[0]
            if top not in roots:
                raise PackageError(f"file nằm ngoài gói: {n}")
            roots[top][n[len(top) + 1 :]] = info
    out: list[Package] = []
    for folder, members in roots.items():
        files: dict[str, bytes] = {}
        for rel, info in members.items():
            if rel == "skin.json":
                continue
            key = _check_path(rel)
            if not key:
                continue
            blob = _read_capped(zf, info, MAX_AUDIO if key.startswith("sfx/") else MAX_IMAGE)
            _sniff(key, blob)
            files[key] = blob
        if len(files) > MAX_FILES:
            raise PackageError(f"{folder or 'gói'}: quá {MAX_FILES} file")
        try:
            raw = json.loads(_read_capped(zf, members["skin.json"], 256 * 1024).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise PackageError(f"{folder or ''}skin.json không phải JSON hợp lệ") from e
        if isinstance(raw, dict):
            raw.pop("assets", None)
        try:
            m = validate_manifest(raw, set(files), allow_default=allow_default)
        except PackageError as e:
            raise PackageError(f"{folder + ': ' if folder else ''}{e}") from e
        extra = sorted(set(files) - set(refs(m)))
        if extra:
            raise PackageError(f"{m['id']}: file không được manifest dùng tới: {', '.join(extra)}")
        out.append(Package(manifest=m, files=files, folder=folder))
    ids = [p.manifest["id"] for p in out]
    if len(set(ids)) != len(ids):
        raise PackageError("id trùng trong bundle")
    return out


def version(manifest: dict[str, Any], files: dict[str, bytes]) -> str:
    h = hashlib.sha256()
    for k in sorted(files):
        h.update(k.encode())
        h.update(b"\0")
        h.update(hashlib.sha256(files[k]).digest())
    return h.hexdigest()[:10]


def portable(manifest: dict[str, Any]) -> dict[str, Any]:
    """Manifest đúng định dạng gói (bỏ `assets` do máy chủ ghi)."""
    m = dict(manifest)
    m.pop("assets", None)
    return m


def _write(
    zf: zipfile.ZipFile, prefix: str, manifest: dict[str, Any], files: dict[str, bytes]
) -> None:
    zf.writestr(
        prefix + "skin.json",
        json.dumps(portable(manifest), ensure_ascii=False, indent=2) + "\n",
    )
    for k in sorted(files):
        zf.writestr(prefix + k, files[k])


def build(manifest: dict[str, Any], files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        _write(zf, "", manifest, files)
    return buf.getvalue()


def build_bundle(packages: list[tuple[dict[str, Any], dict[str, bytes]]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for m, files in packages:
            _write(zf, m["id"] + "/", m, files)
    return buf.getvalue()


def storage_key(skin_id: str, ver: str, path: str) -> str:
    return f"skins/{skin_id}/{ver}/{path}"


def media_type(path: str) -> str:
    return MEDIA_TYPES[path.rsplit(".", 1)[1]]
