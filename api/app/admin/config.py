"""Thông số vận hành chỉnh ở trang admin (docs/06, docs/13): bảng `app_config` key → JSON, cache
trong tiến trình (đọc lại mỗi 15 giây cùng catalog skin). Chỉ các khóa trong DEFAULTS được nhận;
giá trị được kiểm tra kiểu trước khi ghi.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models.admin import AppConfig

DEFAULTS: dict[str, Any] = {
    # Ruột chì cho người thắng trận xếp hạng (docs/06).
    "ranked_win_lead": 30,
    # Giá skin theo bậc hiếm (docs/06): {"common": {"lead": 100}, …}.
    "rarity_price": {
        "common": {"lead": 100},
        "uncommon": {"lead": 250},
        "rare": {"lead": 600},
        "epic": {"lead": 1500},
        "legendary": {"flower": 5},
    },
    # Thưởng điểm danh 7 ngày (docs/06).
    "checkin_rewards": [
        {"lead": 10},
        {"lead": 10},
        {"lead": 15},
        {"lead": 15},
        {"lead": 20},
        {"lead": 20},
        {"lead": 30, "flower": 1},
    ],
    # Ghép máy sau bao nhiêu giây chờ (0 = tắt); None = theo biến môi trường MM_BOT_AFTER_SECONDS.
    "mm_bot_after_seconds": None,
    # Vùng quảng cáo giả "AD here" (docs/10 — Quảng cáo): thử trải nghiệm khi AdSense chưa duyệt;
    # người đã ủng hộ (adFree) vẫn không thấy. Public qua GET /site.
    "ads_mock": False,
}

_cache: dict[str, Any] = {}


def get(key: str) -> Any:
    """Giá trị hiện hành (DB nếu có, không thì mặc định)."""
    if key in _cache:
        return _cache[key]
    return DEFAULTS.get(key)


def get_int(key: str, fallback: int) -> int:
    v = get(key)
    return int(v) if isinstance(v, int | float) and not isinstance(v, bool) else fallback


def snapshot() -> dict[str, Any]:
    return {k: get(k) for k in DEFAULTS}


def _validate(key: str, value: Any) -> Any:
    if key not in DEFAULTS:
        raise AppError("BAD_CONFIG_KEY", 400, key=key)
    if key == "ads_mock":
        if not isinstance(value, bool):
            raise AppError("BAD_CONFIG_VALUE", 400, key=key)
        return value
    if key == "ranked_win_lead":
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 10_000:
            raise AppError("BAD_CONFIG_VALUE", 400, key=key)
        return value
    if key == "mm_bot_after_seconds":
        if value is None:
            return None
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 3600:
            raise AppError("BAD_CONFIG_VALUE", 400, key=key)
        return value
    if key == "rarity_price":
        if not isinstance(value, dict):
            raise AppError("BAD_CONFIG_VALUE", 400, key=key)
        out: dict[str, dict[str, int]] = {}
        for rarity, price in value.items():
            if rarity not in DEFAULTS["rarity_price"] or not isinstance(price, dict):
                raise AppError("BAD_CONFIG_VALUE", 400, key=key)
            clean = {
                c: int(n)
                for c, n in price.items()
                if c in ("lead", "flower") and isinstance(n, int) and n > 0
            }
            if not clean:
                raise AppError("BAD_CONFIG_VALUE", 400, key=key)
            out[rarity] = clean
        return {**DEFAULTS["rarity_price"], **out}
    if key == "checkin_rewards":
        if not isinstance(value, list) or len(value) != 7:
            raise AppError("BAD_CONFIG_VALUE", 400, key=key)
        rewards = []
        for r in value:
            if not isinstance(r, dict):
                raise AppError("BAD_CONFIG_VALUE", 400, key=key)
            clean = {
                c: int(n)
                for c, n in r.items()
                if c in ("lead", "flower") and isinstance(n, int) and n >= 0
            }
            if not clean:
                raise AppError("BAD_CONFIG_VALUE", 400, key=key)
            rewards.append(clean)
        return rewards
    return value  # pragma: no cover


async def sync_from_db(db: AsyncSession) -> None:
    rows = (await db.execute(select(AppConfig))).scalars()
    _cache.clear()
    for r in rows:
        if r.key in DEFAULTS:
            _cache[r.key] = r.value


async def update(db: AsyncSession, changes: dict[str, Any]) -> dict[str, Any]:
    """Ghi các khóa trong `changes` (đã kiểm tra), cập nhật cache tiến trình này. Caller commit."""
    for key, value in changes.items():
        clean = _validate(key, value)
        row = await db.get(AppConfig, key)
        if row is None:
            db.add(AppConfig(key=key, value=clean))
        else:
            row.value = clean
            row.updated_at = datetime.now(UTC)
        _cache[key] = clean
    await db.flush()
    return snapshot()
