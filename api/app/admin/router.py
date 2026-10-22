"""REST quản trị (docs/13 — Admin): chỉ tài khoản Google đã xác minh có email trong ADMIN_EMAILS.

- GET  /admin/stats                      online, kết nối WS, phòng đang chơi, hàng chờ, người dùng,
                                         ván hôm nay
- GET  /admin/users?q=                   tìm theo tên / email / id
- GET  /admin/users/{id}                 ví, hạng, 10 ván gần nhất
- POST /admin/users/{id}/grant           cộng/trừ Ruột chì, Hoa điểm tốt (sổ cái `admin`)
- POST /admin/users/{id}/ban             khóa tới ngày (days) / mở khóa (null); thu hồi phiên,
                                         ngắt WS
- PATCH /admin/users/{id}                đổi tên hiển thị
- GET  /admin/skins · PATCH /admin/skins/{id} (metadata) · PUT (manifest, dùng khi nhập) · DELETE
- GET  /admin/skins/{id}/export (một skin)
- GET  /admin/skins/export · POST /admin/skins/import   (JSON đúng định dạng shared/skins)
- GET  /admin/config · PUT /admin/config (app/admin/config.py)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from redis.asyncio import Redis
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import config as appconfig
from app.auth import service as auth_service
from app.auth import ws_cache
from app.auth.deps import admin_user, get_redis
from app.auth.schemas import CamelModel
from app.db import get_db
from app.economy import periods, wallet
from app.economy.router import avatar_url_for
from app.errors import AppError
from app.game import room as rooms
from app.matchmaking import pending as mmp
from app.matchmaking import queue as mmq
from app.models import Inventory, Match, Rating, User, Wallet
from app.models.admin import SkinRow
from app.rating import service as rating
from app.skins import catalog

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(admin_user)])
Db = Annotated[AsyncSession, Depends(get_db)]
Rd = Annotated[Redis, Depends(get_redis)]


# ---------- Thống kê ----------


class StatsOut(CamelModel):
    online: int
    connections: int
    rooms_playing: int
    queue_waiting: int
    pending_matches: int
    users_total: int
    accounts_total: int
    users_today: int
    matches_today: int
    matches_total: int
    season: dict[str, Any] | None
    server_time: int


@router.get("/stats", response_model=StatsOut)
async def stats(db: Db, redis: Rd) -> StatsOut:
    conns = 0
    async for k in redis.scan_iter("ws:conns:*"):
        v = await redis.get(k)
        conns += int(v or 0)
    day_start = periods.day_start_vn(datetime.now(UTC))
    users_total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    accounts_total = (
        await db.execute(select(func.count()).select_from(User).where(User.is_guest.is_(False)))
    ).scalar_one()
    users_today = (
        await db.execute(select(func.count()).select_from(User).where(User.created_at >= day_start))
    ).scalar_one()
    matches_total = (await db.execute(select(func.count()).select_from(Match))).scalar_one()
    matches_today = (
        await db.execute(select(func.count()).select_from(Match).where(Match.ended_at >= day_start))
    ).scalar_one()
    season = await rating.current_season(db)
    await db.commit()
    return StatsOut(
        online=await mmq.online_count(redis),
        connections=conns,
        rooms_playing=int(await redis.scard(rooms.PLAYING_KEY)),
        queue_waiting=await mmq.size(redis),
        pending_matches=int(await redis.zcard(mmp.PENDING_ZSET)),
        users_total=users_total,
        accounts_total=accounts_total,
        users_today=users_today,
        matches_today=matches_today,
        matches_total=matches_total,
        season={
            "id": season.id,
            "name": season.name,
            "startsAt": season.starts_at.isoformat(),
            "endsAt": season.ends_at.isoformat(),
        },
        server_time=rooms.now_ms(),
    )


# ---------- Người chơi ----------


class AdminUserOut(CamelModel):
    id: uuid.UUID
    display_name: str
    email: str | None
    is_guest: bool
    email_verified: bool
    locale: str
    avatar_url: str | None
    created_at: datetime
    banned_until: datetime | None
    deleted_at: datetime | None
    lead: int
    flower: int
    points: int | None = None
    games: int | None = None


class AdminMatchOut(CamelModel):
    id: uuid.UUID
    mode: str
    board: str
    seat: int
    opponent: str | None
    won: bool | None
    scores: list[int]
    end_reason: str
    points_delta: int | None
    bot_strength: float | None
    ended_at: datetime


class AdminUserDetail(AdminUserOut):
    mmr: float | None = None
    wins: int | None = None
    losses: int | None = None
    identities: list[str]
    matches: list[AdminMatchOut]


async def _user_out(db: AsyncSession, u: User, r: Rating | None = None) -> AdminUserOut:
    w = (await db.execute(select(Wallet).where(Wallet.user_id == u.id))).scalar_one_or_none()
    return AdminUserOut(
        id=u.id,
        display_name=u.display_name,
        email=u.email,
        is_guest=u.is_guest,
        email_verified=u.email_verified_at is not None,
        locale=u.locale,
        avatar_url=avatar_url_for(u),
        created_at=u.created_at,
        banned_until=u.banned_until,
        deleted_at=u.deleted_at,
        lead=w.lead if w else 0,
        flower=w.flower if w else 0,
        points=r.points if r else None,
        games=r.games if r else None,
    )


class AdminUserPage(CamelModel):
    items: list[AdminUserOut]
    total: int
    limit: int
    offset: int


@router.get("/users", response_model=AdminUserPage)
async def users(
    db: Db,
    q: str = Query("", max_length=64),
    kind: str = Query("account", pattern="^(account|guest|all)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> AdminUserPage:
    """Danh sách có phân trang. `kind`: account (mặc định — tài khoản liên kết) | guest | all."""
    base = select(User).where(User.deleted_at.is_(None))
    if kind == "account":
        base = base.where(User.is_guest.is_(False))
    elif kind == "guest":
        base = base.where(User.is_guest.is_(True))
    q = q.strip()
    if q:
        try:
            base = base.where(User.id == uuid.UUID(q))
        except ValueError:
            like = f"%{q}%"
            base = base.where(or_(User.display_name.ilike(like), User.email.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    stmt = base.order_by(User.created_at.desc()).limit(limit).offset(offset)
    found = list((await db.execute(stmt)).scalars())
    season = await rating.current_season(db)
    items = []
    for u in found:
        r = await rating.get_rating(db, u.id, season.id)
        items.append(await _user_out(db, u, r))
    await db.commit()
    return AdminUserPage(items=items, total=total, limit=limit, offset=offset)


async def _load_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    u = await db.get(User, user_id)
    if u is None:
        raise AppError("NOT_FOUND", 404)
    return u


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def user_detail(user_id: uuid.UUID, db: Db) -> AdminUserDetail:
    u = await _load_user(db, user_id)
    season = await rating.current_season(db)
    r = await rating.get_rating(db, u.id, season.id)
    base = await _user_out(db, u, r)
    res = await db.execute(
        select(Match)
        .where((Match.player0 == u.id) | (Match.player1 == u.id))
        .order_by(Match.ended_at.desc())
        .limit(10)
    )
    matches = list(res.scalars())
    opp_ids = {(m.player1 if m.player0 == u.id else m.player0) for m in matches} - {None}
    names: dict[uuid.UUID, str] = {}
    if opp_ids:
        ures = await db.execute(select(User).where(User.id.in_(list(opp_ids))))
        names = {x.id: x.display_name for x in ures.scalars()}
    rows = []
    for mt in matches:
        seat = 0 if mt.player0 == u.id else 1
        opp = mt.player1 if seat == 0 else mt.player0
        rows.append(
            AdminMatchOut(
                id=mt.id,
                mode=mt.mode,
                board=mt.board,
                seat=seat,
                opponent=names.get(opp)
                if opp
                else ("bot" if mt.bot_strength is not None else None),
                won=None if mt.winner is None else mt.winner == seat,
                scores=[mt.scores[seat], mt.scores[1 - seat]],
                end_reason=mt.end_reason,
                points_delta=(mt.points_delta or [None, None])[seat],
                bot_strength=mt.bot_strength,
                ended_at=mt.ended_at,
            )
        )
    full = await auth_service.get_user(db, u.id)  # selectinload identities
    await db.commit()
    return AdminUserDetail(
        **base.model_dump(),
        mmr=r.mmr if r else None,
        wins=r.wins if r else None,
        losses=r.losses if r else None,
        identities=[f"{i.provider}:{i.subject}" for i in (full.identities if full else [])],
        matches=rows,
    )


class GrantIn(CamelModel):
    lead: int = 0
    flower: int = 0
    note: str = ""


@router.post("/users/{user_id}/grant", response_model=AdminUserOut)
async def grant(user_id: uuid.UUID, body: GrantIn, db: Db) -> AdminUserOut:
    u = await _load_user(db, user_id)
    if body.lead == 0 and body.flower == 0:
        raise AppError("BAD_REQUEST", 400)
    ref = f"admin:{body.note[:64]}" if body.note else "admin"
    for cur, amount in (("lead", body.lead), ("flower", body.flower)):
        if amount > 0:
            await wallet.credit(
                db,
                u.id,
                cur,  # type: ignore[arg-type]
                amount,
                source="admin",
                ref=ref,
                idempotency_key=f"admin:{uuid.uuid4()}",
            )
        elif amount < 0:
            await wallet.debit(
                db,
                u.id,
                cur,  # type: ignore[arg-type]
                -amount,
                source="admin",
                ref=ref,
                idempotency_key=f"admin:{uuid.uuid4()}",
            )
    await db.commit()
    return await _user_out(db, u)


class BanIn(CamelModel):
    days: int | None = Field(default=None, ge=0, le=3650)


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
async def ban(user_id: uuid.UUID, body: BanIn, db: Db, redis: Rd) -> AdminUserOut:
    """days = None → mở khóa; days ≥ 0 → khóa tới (now + days). Khóa: thu hồi mọi phiên + token
    (token_version), ngắt WS đang mở; đăng nhập lại bị BANNED cho tới hạn.
    """
    u = await _load_user(db, user_id)
    if body.days is None:
        u.banned_until = None
    else:
        u.banned_until = datetime.now(UTC) + timedelta(days=body.days)
        u.token_version += 1
        await auth_service.revoke_all(db, u.id)
    await db.commit()
    await ws_cache.invalidate(redis, u.id)
    if body.days is not None:
        await redis.publish(f"kick:{u.id}", "4401")
    return await _user_out(db, u)


class RenameIn(CamelModel):
    display_name: str


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def rename(user_id: uuid.UUID, body: RenameIn, db: Db, redis: Rd) -> AdminUserOut:
    u = await _load_user(db, user_id)
    name = body.display_name.strip()
    if not 1 <= len(name) <= 32:
        raise AppError("BAD_REQUEST", 400)
    u.display_name = name
    await db.commit()
    await ws_cache.invalidate(redis, u.id)
    return await _user_out(db, u)


# ---------- Skin ----------


class AdminSkinOut(CamelModel):
    id: str
    type: str
    rarity: str
    enabled: bool
    sort: int
    owners: int
    updated_at: datetime
    manifest: dict[str, Any]


class SkinPutIn(CamelModel):
    manifest: dict[str, Any]
    enabled: bool = True
    sort: int | None = None


async def _skin_out(db: AsyncSession, r: SkinRow) -> AdminSkinOut:
    owners = (
        await db.execute(
            select(func.count()).select_from(Inventory).where(Inventory.item_id == r.id)
        )
    ).scalar_one()
    return AdminSkinOut(
        id=r.id,
        type=r.type,
        rarity=r.rarity,
        enabled=r.enabled,
        sort=r.sort,
        owners=owners,
        updated_at=r.updated_at,
        manifest=r.manifest,
    )


@router.get("/skins", response_model=list[AdminSkinOut])
async def skins(db: Db) -> list[AdminSkinOut]:
    rows = (await db.execute(select(SkinRow).order_by(SkinRow.sort, SkinRow.id))).scalars()
    return [await _skin_out(db, r) for r in rows]


@router.get("/skins/export")
async def skins_export(db: Db) -> dict[str, Any]:
    """Portable: cùng định dạng shared/skins (danh sách manifest), kể cả skin đang tắt."""
    rows = (await db.execute(select(SkinRow).order_by(SkinRow.sort, SkinRow.id))).scalars()
    return {"skins": [r.manifest for r in rows]}


def _validate_manifest(raw: dict[str, Any], skin_id: str | None = None) -> dict[str, Any]:
    try:
        m = catalog.SkinManifestIn.model_validate(raw)
    except ValueError as e:
        raise AppError("BAD_SKIN", 400, detail=str(e)[:300]) from e
    if skin_id is not None and m.id != skin_id:
        raise AppError("BAD_SKIN", 400, detail="id trong manifest khác id trên URL")
    return m.model_dump()


async def _upsert(db: AsyncSession, m: dict[str, Any], enabled: bool, sort: int | None) -> SkinRow:
    row = await db.get(SkinRow, m["id"])
    if row is None:
        mx = (await db.execute(select(func.max(SkinRow.sort)))).scalar_one() or 0
        row = SkinRow(
            id=m["id"],
            type=m["type"],
            rarity=m["rarity"],
            sort=sort if sort is not None else mx + 1,
        )
        db.add(row)
    row.type, row.rarity, row.manifest, row.enabled = m["type"], m["rarity"], m, enabled
    if sort is not None:
        row.sort = sort
    row.updated_at = datetime.now(UTC)
    await db.flush()
    return row


@router.put("/skins/{skin_id}", response_model=AdminSkinOut)
async def skin_put(skin_id: str, body: SkinPutIn, db: Db) -> AdminSkinOut:
    m = _validate_manifest(body.manifest, skin_id)
    if m["default"] and not body.enabled:
        raise AppError("SKIN_DEFAULT_PROTECTED", 409)
    row = await _upsert(db, m, body.enabled, body.sort)
    await db.commit()
    await catalog.sync_from_db(db)
    return await _skin_out(db, row)


class SkinMetaIn(CamelModel):
    """Chỉ metadata: tên, mô tả, bậc, bật/tắt, thứ tự. Khối hiệu ứng (`pen`/`box`/`forms`/
    `combo`/`sfx`) chỉ đổi được bằng nhập JSON (portable), không sửa tay trên giao diện."""

    name: dict[str, str] | None = None
    description: dict[str, str] | None = None
    rarity: str | None = None
    enabled: bool | None = None
    sort: int | None = None


@router.patch("/skins/{skin_id}", response_model=AdminSkinOut)
async def skin_patch(skin_id: str, body: SkinMetaIn, db: Db) -> AdminSkinOut:
    row = await db.get(SkinRow, skin_id)
    if row is None:
        raise AppError("NOT_FOUND", 404)
    m = dict(row.manifest)
    if body.name is not None:
        m["name"] = body.name
    if body.description is not None:
        m["description"] = body.description
    if body.rarity is not None:
        m["rarity"] = body.rarity
    m = _validate_manifest(m, skin_id)
    enabled = row.enabled if body.enabled is None else body.enabled
    if m["default"] and not enabled:
        raise AppError("SKIN_DEFAULT_PROTECTED", 409)
    row = await _upsert(db, m, enabled, body.sort)
    await db.commit()
    await catalog.sync_from_db(db)
    return await _skin_out(db, row)


@router.get("/skins/{skin_id}/export")
async def skin_export(skin_id: str, db: Db) -> dict[str, Any]:
    """Một skin, cùng định dạng file shared/skins/<type>/<id>.json."""
    row = await db.get(SkinRow, skin_id)
    if row is None:
        raise AppError("NOT_FOUND", 404)
    return row.manifest


@router.delete("/skins/{skin_id}")
async def skin_delete(skin_id: str, db: Db) -> dict[str, bool]:
    row = await db.get(SkinRow, skin_id)
    if row is None:
        raise AppError("NOT_FOUND", 404)
    if row.manifest.get("default"):
        raise AppError("SKIN_DEFAULT_PROTECTED", 409)
    await db.delete(row)
    await db.commit()
    await catalog.sync_from_db(db)
    return {"ok": True}


class SkinsImportIn(CamelModel):
    skins: list[dict[str, Any]]
    # true: xóa những skin không có trong file (trừ default); false: chỉ thêm / ghi đè.
    replace: bool = False


@router.post("/skins/import", response_model=list[AdminSkinOut])
async def skins_import(body: SkinsImportIn, db: Db) -> list[AdminSkinOut]:
    manifests = [_validate_manifest(raw) for raw in body.skins]
    ids = {m["id"] for m in manifests}
    if len(ids) != len(manifests):
        raise AppError("BAD_SKIN", 400, detail="id trùng trong file")
    for t in catalog.TYPES:
        if body.replace and not any(m["type"] == t and m["default"] for m in manifests):
            raise AppError("BAD_SKIN", 400, detail=f"thiếu skin default cho {t}")
    for i, m in enumerate(manifests):
        await _upsert(db, m, True, i)
    if body.replace:
        rows = (await db.execute(select(SkinRow))).scalars()
        for r in list(rows):
            if r.id not in ids and not r.manifest.get("default"):
                await db.delete(r)
    await db.commit()
    await catalog.sync_from_db(db)
    return await skins(db)


# ---------- Thông số ----------


class ConfigOut(CamelModel):
    values: dict[str, Any]
    defaults: dict[str, Any]


@router.get("/config", response_model=ConfigOut)
async def config_get() -> ConfigOut:
    return ConfigOut(values=appconfig.snapshot(), defaults=appconfig.DEFAULTS)


@router.put("/config", response_model=ConfigOut)
async def config_put(body: dict[str, Any], db: Db) -> ConfigOut:
    values = await appconfig.update(db, body)
    await db.commit()
    return ConfigOut(values=values, defaults=appconfig.DEFAULTS)
