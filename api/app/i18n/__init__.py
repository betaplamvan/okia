"""i18n backend (docs/11): catalog JSON vi/en, hàm t(), xác định locale theo thứ tự ưu tiên."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

Locale = Literal["vi", "en"]
LOCALES: tuple[Locale, ...] = ("vi", "en")
DEFAULT_LOCALE: Locale = "vi"

_LOCALES_DIR = Path(__file__).parent / "locales"


@lru_cache
def _catalog(locale: str) -> dict[str, str]:
    """Phẳng hóa JSON lồng nhau thành {"a.b.c": "..."}."""
    data = json.loads((_LOCALES_DIR / f"{locale}.json").read_text(encoding="utf-8"))
    flat: dict[str, str] = {}

    def walk(obj: object, prefix: str) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, f"{prefix}.{k}" if prefix else str(k))
        elif isinstance(obj, str):
            flat[prefix] = obj

    walk(data, "")
    return flat


def catalog_keys(locale: str) -> set[str]:
    return set(_catalog(locale))


def t(key: str, locale: str = DEFAULT_LOCALE, /, **params: object) -> str:
    """Dịch `key`; thiếu ở locale yêu cầu → dùng vi; thiếu cả vi → trả về key."""
    text = _catalog(locale).get(key) if locale in LOCALES else None
    if text is None:
        text = _catalog(DEFAULT_LOCALE).get(key, key)
    try:
        return text.format(**params) if params else text
    except (KeyError, IndexError):
        return text


def resolve_locale(
    user_locale: str | None = None,
    accept_language: str | None = None,
    explicit: str | None = None,
) -> Locale:
    """Thứ tự ưu tiên (docs/11): locale đã lưu của người chơi → tham số tường minh
    (WebSocket `?lang=`) → Accept-Language → vi."""
    for cand in (user_locale, explicit):
        if cand in LOCALES:
            return cand  # type: ignore[return-value]
    if accept_language:
        for part in accept_language.split(","):
            tag = part.split(";")[0].strip().lower()
            base = tag.split("-")[0]
            if base in LOCALES:
                return base  # type: ignore[return-value]
    return DEFAULT_LOCALE
