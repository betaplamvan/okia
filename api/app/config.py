"""Cấu hình từ biến môi trường / .env (docs/02 — Môi trường)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://okia:okia@localhost:5433/okia"
    redis_url: str = "redis://localhost:6380/0"
    # HS256 cần khóa ≥ 32 byte (RFC 7518); sinh bằng `openssl rand -hex 32`.
    jwt_secret: str = Field(default="dev-only-secret-khong-dung-o-production-0", min_length=32)
    app_base_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    # Xác thực (docs/13)
    access_token_ttl_seconds: int = 60 * 60
    refresh_token_ttl_days: int = 30
    verify_token_ttl_hours: int = 24
    reset_token_ttl_minutes: int = 30
    # Cookie refresh: Secure chỉ khi https (production); dev trên http://localhost thì tắt.
    cookie_secure: bool = False
    cookie_domain: str | None = None

    # Google OAuth (Authorization Code + PKCE, xử lý ở backend)
    google_client_id: str = ""
    google_client_secret: str = ""
    # URL public của API (để dựng redirect_uri cho Google), ví dụ https://api.okia.vn
    api_base_url: str = "http://localhost:8000"

    # Email giao dịch: resend (mặc định, cả khi dev) | console (test: in log, giữ trong bộ nhớ)
    email_provider: Literal["resend", "console"] = "resend"
    resend_api_key: str = ""
    email_from: str = "Ô Kìa <onboarding@resend.dev>"
    resend_webhook_secret: str = ""

    # Object storage S3/MinIO cho ảnh người dùng tải lên (ADR-0010). Trống → giữ trong bộ nhớ
    # (test/dev; mất khi restart). S3_PUBLIC_URL = URL gốc đọc ẩn danh của bucket
    # (vd https://minio.example.com/okia-bucket); trống → API tự phục vụ qua /avatars/{id}.webp.
    s3_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "okia-bucket"
    s3_region: str = "us-east-1"
    s3_public_url: str = ""

    @property
    def s3_enabled(self) -> bool:
        return bool(self.s3_endpoint_url and self.s3_access_key and self.s3_secret_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
