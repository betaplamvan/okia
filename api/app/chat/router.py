"""Chat tổng (docs/15): một kênh chung toàn trang.

- GET  /chat/meta       số người online + id tin mới nhất (bong bóng đếm tin chưa đọc). Gọi định kỳ
                        khi trang mở → cũng đánh dấu người gọi đang online.
- GET  /chat/messages   50 tin gần nhất (cũ → mới), phân trang lùi `?before=<id>`. Ai cũng đọc được.
- POST /chat/messages   gửi tin — chỉ tài khoản Google (khách chỉ đọc). Giới hạn tốc độ: 1 tin /
                        2 giây, 12 tin / phút, không lặp đúng nội dung trong 30 giây. Tin mới phát
                        qua WS `chat_msg` (kênh Redis `chat:all`).
"""

from __future__ import annotations

import hashlib
import re
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import ratelimit
from app.auth.deps import account_user, get_redis, optional_user
from app.auth.schemas import CamelModel
from app.db import get_db
from app.economy.router import avatar_url_for
from app.errors import AppError
from app.matchmaking import queue as mmq
from app.models import ChatMessage, Rating, User
from app.rating import service as rating_service
from app.ws import messages as m

router = APIRouter(tags=["chat"])
Db = Annotated[AsyncSession, Depends(get_db)]
Rd = Annotated[Redis, Depends(get_redis)]

MAX_LEN = 300
MAX_LINES = 6
PAGE = 50
REPLY_PREVIEW = 80
DUP_SECONDS = 30


def clean_body(raw: str) -> str:
    """Bỏ khoảng trắng thừa: tối đa MAX_LINES dòng, không quá một dòng trống liền nhau."""
    lines = [ln.rstrip() for ln in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    parts = text.split("\n")
    if len(parts) > MAX_LINES:
        text = (
            "\n".join(parts[: MAX_LINES - 1])
            + "\n"
            + " ".join(p.strip() for p in parts[MAX_LINES - 1 :])
        )
    return text


class MetaOut(CamelModel):
    online: int
    last_id: int


class PageOut(CamelModel):
    items: list[m.ChatMessageOut]
    has_more: bool


class SendIn(CamelModel):
    body: str
    reply_to: int | None = None


async def _ranks(db: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, m.RankOut]:
    if not user_ids:
        return {}
    season = await rating_service.current_season(db)
    rows = (
        await db.execute(
            select(Rating).where(Rating.season_id == season.id, Rating.user_id.in_(user_ids))
        )
    ).scalars()
    out: dict[uuid.UUID, m.RankOut] = {}
    for r in rows:
        rank = rating_service.visible_rank(r)
        if rank is not None:
            out[r.user_id] = m.RankOut(**rank.to_dict())
    return out


async def _build(db: AsyncSession, rows: list[tuple[ChatMessage, User]]) -> list[m.ChatMessageOut]:
    reply_ids = {msg.reply_to_id for msg, _ in rows if msg.reply_to_id}
    replies: dict[int, tuple[ChatMessage, User]] = {}
    if reply_ids:
        for msg, u in (
            await db.execute(
                select(ChatMessage, User)
                .join(User, User.id == ChatMessage.user_id)
                .where(ChatMessage.id.in_(reply_ids))
            )
        ).all():
            replies[msg.id] = (msg, u)
    ranks = await _ranks(db, {u.id for _, u in rows})
    out: list[m.ChatMessageOut] = []
    for msg, u in rows:
        reply = None
        if msg.reply_to_id:
            got = replies.get(msg.reply_to_id)
            if got is None or got[0].deleted_at is not None:
                reply = m.ChatReplyOut(
                    id=msg.reply_to_id,
                    name=got[1].display_name if got else "",
                    body="",
                    deleted=True,
                )
            else:
                rmsg, ru = got
                body = rmsg.body.replace("\n", " ")
                if len(body) > REPLY_PREVIEW:
                    body = body[: REPLY_PREVIEW - 1] + "…"
                reply = m.ChatReplyOut(id=rmsg.id, name=ru.display_name, body=body)
        out.append(
            m.ChatMessageOut(
                id=msg.id,
                user_id=str(u.id),
                name=u.display_name,
                avatar_url=avatar_url_for(u),
                donor=u.ad_free_at is not None,
                rank=ranks.get(u.id),
                body=msg.body,
                created_at=msg.created_at.isoformat(),
                reply=reply,
            )
        )
    return out


@router.get("/chat/meta", response_model=MetaOut)
async def chat_meta(
    db: Db, redis: Rd, user: Annotated[User | None, Depends(optional_user)]
) -> MetaOut:
    if user is not None:
        await mmq.touch_online(redis, str(user.id))
    last = (
        await db.execute(select(func.max(ChatMessage.id)).where(ChatMessage.deleted_at.is_(None)))
    ).scalar_one()
    return MetaOut(online=await mmq.online_count(redis), last_id=int(last or 0))


@router.get("/chat/messages", response_model=PageOut)
async def chat_messages(db: Db, before: Annotated[int | None, Query(ge=1)] = None) -> PageOut:
    stmt = (
        select(ChatMessage, User)
        .join(User, User.id == ChatMessage.user_id)
        .where(ChatMessage.deleted_at.is_(None))
        .order_by(ChatMessage.id.desc())
        .limit(PAGE + 1)
    )
    if before is not None:
        stmt = stmt.where(ChatMessage.id < before)
    rows = [(msg, u) for msg, u in (await db.execute(stmt)).all()]
    has_more = len(rows) > PAGE
    rows = rows[:PAGE]
    rows.reverse()
    items = await _build(db, rows)
    await db.commit()  # current_season có thể vừa mở mùa mới
    return PageOut(items=items, has_more=has_more)


@router.post("/chat/messages", response_model=m.ChatMessageOut)
async def chat_send(
    body: SendIn, db: Db, redis: Rd, user: Annotated[User, Depends(account_user)]
) -> m.ChatMessageOut:
    text = clean_body(body.body)
    if not text:
        raise AppError("CHAT_EMPTY", 400)
    if len(text) > MAX_LEN:
        raise AppError("CHAT_TOO_LONG", 400, max=MAX_LEN)
    uid = str(user.id)
    await ratelimit.hit(redis, f"chat:s:{uid}", 1, 2)
    await ratelimit.hit(redis, f"chat:m:{uid}", 12, 60)
    digest = hashlib.sha1(" ".join(text.lower().split()).encode()).hexdigest()
    dup_key = f"chat:dup:{uid}"
    last = await redis.get(dup_key)
    if (last.decode() if isinstance(last, bytes) else last) == digest:
        raise AppError("CHAT_DUPLICATE", 429)
    await redis.set(dup_key, digest, ex=DUP_SECONDS)

    reply_to = None
    if body.reply_to is not None:
        reply_to = (
            await db.execute(
                select(ChatMessage.id).where(
                    ChatMessage.id == body.reply_to, ChatMessage.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()
    msg = ChatMessage(user_id=user.id, body=text, reply_to_id=reply_to)
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    (out,) = await _build(db, [(msg, user)])
    await db.commit()
    await mmq.touch_online(redis, uid)
    await redis.publish("chat:all", m.dump(m.ChatMsg(message=out)))
    return out
