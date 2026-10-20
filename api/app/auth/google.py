"""Google OAuth — Authorization Code + PKCE ở backend (docs/13 — Google OAuth).

- start(): sinh state + code_verifier, lưu Redis 10 phút kèm ngữ cảnh (user đang giữ token, locale),
  trả URL để client chuyển hướng.
- exchange(): đổi `code` lấy `id_token` (httpx), xác minh chữ ký bằng JWKS của Google (PyJWT).
"""

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt
from redis.asyncio import Redis

from app.config import get_settings
from app.errors import AppError

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
STATE_TTL = 600

_jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True)


def redirect_uri() -> str:
    return f"{get_settings().api_base_url}/auth/google/callback"


@dataclass
class StartContext:
    user_id: str | None  # user đang giữ token (khách → nâng cấp; tài khoản → liên kết)
    locale: str
    return_to: str  # đường dẫn trong web để quay về


async def start(redis: Redis, ctx: StartContext) -> str:
    s = get_settings()
    if not s.google_enabled:
        raise AppError("GOOGLE_DISABLED", 503)
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    await redis.set(
        f"oauth:google:{state}",
        json.dumps({"v": verifier, **ctx.__dict__}),
        ex=STATE_TTL,
    )
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


@dataclass
class GoogleProfile:
    sub: str
    email: str
    name: str | None
    picture: str | None


async def pop_state(redis: Redis, state: str) -> tuple[str, StartContext]:
    raw = await redis.getdel(f"oauth:google:{state}")
    if not raw:
        raise AppError("OAUTH_STATE", 400)
    data = json.loads(raw)
    return data.pop("v"), StartContext(**data)


async def exchange(code: str, verifier: str) -> GoogleProfile:
    s = get_settings()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "redirect_uri": redirect_uri(),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
        )
    if res.status_code != 200:
        raise AppError("OAUTH_FAILED", 400)
    id_token = res.json().get("id_token")
    if not id_token:
        raise AppError("OAUTH_FAILED", 400)
    return verify_id_token(id_token)


def verify_id_token(id_token: str) -> GoogleProfile:
    s = get_settings()
    try:
        key = _jwks.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=s.google_client_id,
            issuer=list(ISSUERS),
        )
    except jwt.PyJWTError as e:
        raise AppError("OAUTH_FAILED", 400) from e
    if not claims.get("email_verified") or not claims.get("email"):
        raise AppError("OAUTH_EMAIL_UNVERIFIED", 400)
    return GoogleProfile(
        sub=claims["sub"],
        email=claims["email"].strip().lower(),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )
