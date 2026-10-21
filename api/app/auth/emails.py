"""Email giao dịch (docs/13): Resend ở mọi môi trường thật; `console` khi chạy test.

Mẫu thư lấy chữ từ catalog i18n (`emails.<tên>.*`), bọc trong bố cục "sticker" của game
(thẻ giấy viền mực trên nền xanh bảng, nút mint). Gửi ngoài request chính (BackgroundTasks),
retry 3 lần, lỗi chỉ ghi log kèm user_id + mục đích.
"""

import asyncio
import html
import logging
from dataclasses import dataclass, field
from typing import Literal

from app.config import get_settings
from app.i18n import Locale, t

log = logging.getLogger("okia.email")

Template = Literal["welcome"]

# Bảng màu docs/14; font hệ thống vì email client không tải web font.
INK = "#1a2826"
PAPER = "#fffcf2"
GREEN = "#35544a"
MINT = "#7cf5c5"
CREAM = "#f5f1e8"
FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


@dataclass
class Message:
    to: str
    subject: str
    text: str
    html: str
    user_id: str
    purpose: str


@dataclass
class ConsoleOutbox:
    """Provider cho test/dev: in ra log và giữ trong bộ nhớ để test đọc lại."""

    sent: list[Message] = field(default_factory=list)

    async def send(self, m: Message) -> None:
        self.sent.append(m)
        log.info("[email:%s] to=%s subject=%s", m.purpose, m.to, m.subject)


class ResendProvider:
    async def send(self, m: Message) -> None:
        import resend

        s = get_settings()
        resend.api_key = s.resend_api_key
        params: resend.Emails.SendParams = {
            "from": s.email_from,
            "to": [m.to],
            "subject": m.subject,
            "text": m.text,
            "html": m.html,
        }
        # SDK đồng bộ (requests) → chạy ở thread để không chặn event loop.
        await asyncio.to_thread(resend.Emails.send, params)


_outbox = ConsoleOutbox()


def get_provider() -> ConsoleOutbox | ResendProvider:
    if get_settings().email_provider == "console":
        return _outbox
    return ResendProvider()


def outbox() -> ConsoleOutbox:
    """Chỉ dùng trong test (EMAIL_PROVIDER=console)."""
    return _outbox


def layout(*, title: str, paragraphs: list[str], action: str, link: str, footer: str) -> str:
    """HTML email kiểu sticker: bảng lồng nhau + style inline để Gmail/Outlook hiểu được.
    Mọi chuỗi đã escape; chỉ `link` được dùng làm href."""
    h = html.escape
    app = get_settings().app_base_url
    body = "".join(
        f'<p style="margin:0 0 14px;font-size:17px;line-height:1.5;color:{INK}">{h(p)}</p>'
        for p in paragraphs
    )
    button = (
        f'<table role="presentation" cellspacing="0" cellpadding="0" border="0" '
        f'style="margin:8px 0 20px"><tr><td style="background:{MINT};border:3px solid {INK};'
        f'border-radius:999px;box-shadow:4px 4px 0 {INK}">'
        f'<a href="{h(link)}" style="display:inline-block;padding:12px 26px;font-family:{FONT};'
        f'font-size:17px;font-weight:700;color:{INK};text-decoration:none">{h(action)} →</a>'
        f"</td></tr></table>"
        if action and link
        else ""
    )
    card_style = (
        f"background:{PAPER};border:3px solid {INK};border-radius:24px;"
        f"box-shadow:6px 6px 0 {INK};padding:28px 28px 20px;font-family:{FONT}"
    )
    footer_style = (
        f"margin:0;padding-top:14px;border-top:2px dashed {INK};"
        "font-size:13px;line-height:1.5;color:#55615e"
    )
    logo = (
        f'<a href="{h(app)}" style="text-decoration:none">'
        f'<img src="{h(app)}/brand/logo-email.png" width="170" height="82" alt="Ô Kìa" '
        'style="display:block;border:0;width:170px;height:auto"></a>'
    )
    host = app.removeprefix("https://").removeprefix("http://")
    table = 'role="presentation" cellspacing="0" cellpadding="0" border="0"'
    return (
        '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width"><title>{h(title)}</title></head>'
        f'<body style="margin:0;padding:0;background:{GREEN}">'
        f'<table {table} width="100%" style="background:{GREEN}"><tr>'
        '<td align="center" style="padding:32px 16px">'
        f'<table {table} width="100%" style="max-width:520px">'
        f'<tr><td align="center" style="padding:0 0 20px">{logo}</td></tr>'
        f'<tr><td style="{card_style}">'
        f'<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:{INK}">{h(title)}</h1>'
        f'{body}{button}<p style="{footer_style}">{h(footer)}</p></td></tr>'
        f'<tr><td align="center" style="padding:22px 0 0;font-family:{FONT};font-size:13px;'
        f'color:{CREAM}">Ô Kìa · <a href="{h(app)}" style="color:{CREAM}">{h(host)}</a></td></tr>'
        "</table></td></tr></table></body></html>"
    )


def render(template: Template, locale: Locale, **params: str) -> tuple[str, str, str]:
    """→ (subject, text, html)."""
    subject = t(f"emails.{template}.subject", locale, **params)
    body = t(f"emails.{template}.body", locale, **params)
    link = params.get("link", "")
    action = t(f"emails.{template}.action", locale, **params) if link else ""
    footer = t("emails.footer", locale)
    text = body + (f"\n\n{action}: {link}" if action else "") + f"\n\n{footer}"
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    html_body = layout(
        title=subject, paragraphs=paragraphs, action=action, link=link, footer=footer
    )
    return subject, text, html_body


async def send_email(
    template: Template, *, to: str, locale: Locale, user_id: str, **params: str
) -> None:
    subject, text, html_body = render(template, locale, **params)
    m = Message(
        to=to, subject=subject, text=text, html=html_body, user_id=user_id, purpose=template
    )
    provider = get_provider()
    for attempt in range(3):
        try:
            await provider.send(m)
            return
        except Exception:  # noqa: BLE001
            if attempt == 2:
                log.exception("gửi email thất bại user=%s purpose=%s", user_id, template)
            else:
                await asyncio.sleep(1.5 * (attempt + 1))
