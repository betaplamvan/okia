"""Object storage cho file người dùng tải lên (ảnh đại diện — ADR-0010, cập nhật 2026-10-21).

S3-compatible (MinIO) qua boto3; boto3 đồng bộ nên mọi lệnh chạy trong thread. Không cấu hình
`S3_ENDPOINT_URL` → MemoryStorage (test / dev nhanh): mất khi tiến trình dừng, cấm ở production.
"""

import asyncio
import json
from functools import lru_cache
from typing import Protocol

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import Settings, get_settings
from app.errors import AppError

CACHE_IMMUTABLE = "public, max-age=31536000, immutable"
PUBLIC_PREFIX = "avatars/"


class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes | None: ...
    async def delete(self, key: str) -> None: ...


class MemoryStorage:
    def __init__(self) -> None:
        self._objects: dict[str, bytes] = {}

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self._objects[key] = data

    async def get(self, key: str) -> bytes | None:
        return self._objects.get(key)

    async def delete(self, key: str) -> None:
        self._objects.pop(key, None)


class S3Storage:
    def __init__(self, s: Settings) -> None:
        self.bucket = s.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint_url,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            region_name=s.s3_region,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},  # MinIO: bucket nằm trong path
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=5,
                read_timeout=15,
            ),
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            await asyncio.to_thread(
                self.client.put_object,
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                CacheControl=CACHE_IMMUTABLE,
            )
        except (ClientError, BotoCoreError) as e:
            raise AppError("STORAGE_UNAVAILABLE", 503) from e

    async def get(self, key: str) -> bytes | None:
        try:
            res = await asyncio.to_thread(self.client.get_object, Bucket=self.bucket, Key=key)
            return await asyncio.to_thread(res["Body"].read)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                return None
            raise AppError("STORAGE_UNAVAILABLE", 503) from e
        except BotoCoreError as e:
            raise AppError("STORAGE_UNAVAILABLE", 503) from e

    async def delete(self, key: str) -> None:
        try:
            await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)
        except (ClientError, BotoCoreError) as e:
            raise AppError("STORAGE_UNAVAILABLE", 503) from e

    # ---- quản trị (scripts/s3_setup.py), đồng bộ ----

    def ensure_bucket(self) -> bool:
        """Tạo bucket nếu chưa có. Trả về True nếu vừa tạo."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return False
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") not in ("404", "NoSuchBucket"):
                raise
        self.client.create_bucket(Bucket=self.bucket)
        return True

    def allow_public_read(self, prefix: str = PUBLIC_PREFIX) -> None:
        """Cho đọc ẩn danh các object dưới `prefix` (ảnh đại diện vốn công khai với đối thủ)."""
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicRead",
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{self.bucket}/{prefix}*"],
                }
            ],
        }
        self.client.put_bucket_policy(Bucket=self.bucket, Policy=json.dumps(policy))


@lru_cache
def get_storage() -> ObjectStorage:
    s = get_settings()
    return S3Storage(s) if s.s3_enabled else MemoryStorage()


def public_url(key: str) -> str | None:
    """URL đọc trực tiếp từ bucket khi `S3_PUBLIC_URL` được đặt; None → API tự phục vụ."""
    base = get_settings().s3_public_url.rstrip("/")
    return f"{base}/{key}" if base else None
