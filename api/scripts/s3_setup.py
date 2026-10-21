"""Chuẩn bị bucket MinIO/S3 cho ảnh đại diện (chạy một lần, hoặc sau khi đổi bucket):
tạo bucket nếu chưa có và cho đọc ẩn danh prefix `avatars/` để trình duyệt tải thẳng từ bucket.

    cd api && uv run python -m scripts.s3_setup
"""

from app.config import get_settings
from app.storage import PUBLIC_PREFIX, S3Storage


def main() -> None:
    s = get_settings()
    if not s.s3_enabled:
        raise SystemExit("Thieu S3_ENDPOINT_URL / S3_ACCESS_KEY / S3_SECRET_KEY trong .env")
    st = S3Storage(s)
    created = st.ensure_bucket()
    st.allow_public_read(PUBLIC_PREFIX)
    print(f"bucket {s.s3_bucket}@{s.s3_endpoint_url}: {'tao moi' if created else 'da co'};")
    print(f"doc an danh: {PUBLIC_PREFIX}* -> {s.s3_public_url or '(chua dat S3_PUBLIC_URL)'}")


if __name__ == "__main__":
    main()
