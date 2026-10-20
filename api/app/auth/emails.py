"""Email giao dịch (docs/13): Resend ở mọi môi trường thật; `console` khi chạy test.

Ba mẫu, mỗi mẫu vi/en lấy từ catalog i18n (`emails.<tên>.*`), text thuần + HTML tối giản.
Gửi ngoài request chính (BackgroundTasks), retry 3 lần, lỗi chỉ ghi log kèm user_id + mục đích.
"""

import asyncio
import html
import logging
from dataclasses import dataclass, field
from typing import Literal

from app.config import get_settings
from app.i18n import Locale, t

log = logging.getLogger("okia.email")

Template = Literal["verify", "reset", "duplicate", "google_only"]


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


def render(template: Template, locale: Locale, **params: str) -> tuple[str, str, str]:
    """→ (subject, text, html). `params` được escape khi vào HTML."""
    subject = t(f"emails.{template}.subject", locale, **params)
    body = t(f"emails.{template}.body", locale, **params)
    action = t(f"emails.{template}.action", locale, **params) if "link" in params else ""
    footer = t("emails.footer", locale)
    text = body + (f"\n\n{action}: {params['link']}" if action else "") + f"\n\n{footer}"
    h = lambda s: html.escape(s)  # noqa: E731
    button = (
        f'<p><a href="{h(params["link"])}" style="display:inline-block;padding:12px 20px;'
        f"background:#7cf5c5;color:#1a2826;border:3px solid #1a2826;border-radius:999px;"
        f'font-weight:700;text-decoration:none">{h(action)}</a></p>'
        f'<p style="color:#666;font-size:13px">{h(params["link"])}</p>'
        if action
        else ""
    )
    html_body = (
        '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;'
        'padding:24px;color:#1a2826">'
        f'<h2 style="margin:0 0 12px">Ô Kìa</h2><p>{h(body).replace(chr(10), "<br>")}</p>'
        f'{button}<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">'
        f'<p style="color:#666;font-size:13px">{h(footer)}</p></div>'
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
