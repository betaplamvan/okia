"""Ảnh đại diện tự tải lên (ADR-0010): nhận ảnh ≤ 2 MB, chuẩn hóa thành WebP vuông 256px,
lưu `users.avatar_blob`; phục vụ qua GET /avatars/{id}.webp?v=N (cache bất biến theo version)."""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import AppError

MAX_UPLOAD = 2 * 1024 * 1024
SIZE = 256
MAX_STORED = 120 * 1024

Image.MAX_IMAGE_PIXELS = 40_000_000  # chặn bom giải nén


def normalize(data: bytes) -> bytes:
    if len(data) > MAX_UPLOAD:
        raise AppError("AVATAR_TOO_LARGE", 413)
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im)
            im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
            # Cắt vuông ở giữa rồi thu về 256.
            w, h = im.size
            side = min(w, h)
            box = ((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2)
            im = im.crop(box).resize((SIZE, SIZE), Image.LANCZOS)
            if im.mode == "RGBA":
                bg = Image.new("RGB", im.size, (255, 252, 242))  # màu giấy
                bg.paste(im, mask=im.getchannel("A"))
                im = bg
            out = io.BytesIO()
            for q in (82, 70, 55):
                out.seek(0)
                out.truncate()
                im.save(out, format="WEBP", quality=q, method=4)
                if out.tell() <= MAX_STORED:
                    break
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise AppError("AVATAR_INVALID", 422) from e
