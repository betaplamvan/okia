from app.i18n import catalog_keys, resolve_locale, t


def test_vi_en_cung_tap_key() -> None:
    assert catalog_keys("vi") == catalog_keys("en")


def test_khong_co_chuoi_rong() -> None:
    for loc in ("vi", "en"):
        for key in catalog_keys(loc):
            assert t(key, loc).strip(), f"{loc}:{key} rỗng"


def test_t_tham_so_va_fallback() -> None:
    assert t("errors.RATE_LIMITED", "en", retryAfter=5) == "Too fast, try again in 5 seconds."
    assert t("errors.RATE_LIMITED", "vi", retryAfter=5).endswith("5 giây.")
    assert t("khong.ton.tai", "en") == "khong.ton.tai"
    assert t("errors.GAME_OVER", "xx") == t("errors.GAME_OVER", "vi")


def test_resolve_locale_thu_tu_uu_tien() -> None:
    assert resolve_locale("en", "vi-VN") == "en"  # users.locale thắng
    assert resolve_locale(None, "vi-VN,vi;q=0.9,en;q=0.8") == "vi"
    assert resolve_locale(None, "en-GB") == "en"
    assert resolve_locale(None, "fr") == "vi"
    assert resolve_locale(None, None, explicit="en") == "en"
    assert resolve_locale(None, None) == "vi"
