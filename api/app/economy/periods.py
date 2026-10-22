"""Ngày/tuần theo giờ Việt Nam (docs/06): mốc reset 0h Asia/Ho_Chi_Minh."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def now_vn(now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(TZ)


def today_vn(now: datetime | None = None) -> date:
    return now_vn(now).date()


def day_start_vn(now: datetime | None = None) -> datetime:
    """00:00 hôm nay theo giờ VN, trả về aware UTC (lọc 'hôm nay' trong DB)."""
    d = today_vn(now)
    return datetime(d.year, d.month, d.day, tzinfo=TZ).astimezone(UTC)


def daily_key(now: datetime | None = None) -> str:
    return today_vn(now).isoformat()


def weekly_key(now: datetime | None = None) -> str:
    y, w, _ = today_vn(now).isocalendar()
    return f"{y}-W{w:02d}"


def next_daily_reset(now: datetime | None = None) -> datetime:
    d = now_vn(now)
    return (d + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


def next_weekly_reset(now: datetime | None = None) -> datetime:
    d = now_vn(now)
    days = 7 - d.isoweekday() + 1  # thứ Hai kế tiếp
    return (d + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)


def epoch_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)
