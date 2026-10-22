"""REST quản trị (docs/13 — Admin): chỉ tài khoản Google đã xác minh có email trong ADMIN_EMAILS.

- GET  /admin/stats                      online, kết nối WS, phòng đang chơi, hàng chờ, người dùng,
                                         ván hôm nay
- GET  /admin/users?q=                   tìm theo tên / email / id
- GET  /admin/users/{id}                 ví, hạng, 10 ván gần nhất
- POST /admin/users/{id}/grant           cộng/trừ Ruột chì, Hoa điểm tốt (sổ cái `admin`)
- POST /admin/users/{id}/ban             khóa tới ngày (days) / mở khóa (null); thu hồi phiên,
                                         ngắt WS
- PATCH /admin/users/{id}                đổi tên hiển thị
- GET  /admin/skins · PATCH /admin/skins/{id} (metadata) · PUT (manifest JSON) · DELETE
- GET  /admin/skins/{id}/export (manifest JSON) · GET /admin/skins/{id}/package (zip gói)
- GET  /admin/skins/export (bundle zip; ?format=json) · POST /admin/skins/import (JSON)
- POST /admin/skins/import-package (multipart zip: một gói hoặc bundle — shared/skins/SPEC.md)
- GET  /admin/config · PUT /admin/config (app/admin/config.py)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import Field
from redis.asyncio import Redis
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
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
from app.skins import catalog, package

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


async def _files_of(r: SkinRow) -> dict[str, bytes]:
    """File asset của một skin gói (đọc từ object storage); skin JSON thuần → rỗng."""
    a = r.manifest.get("assets") or {}
    st = storage.get_storage()
    out: dict[str, bytes] = {}
    for f in a.get("files", []):
        blob = await st.get(package.storage_key(r.id, a["ver"], f))
        if blob is not None:
            out[f] = blob
    return out


async def _drop_files(skin_id: str, assets: dict[str, Any] | None) -> None:
    """Dọn asset phiên bản cũ sau khi DB đã đổi; lỗi storage không làm hỏng thao tác."""
    if not assets or not assets.get("files"):
        return
    st = storage.get_storage()
    for f in assets["files"]:
        try:
            await st.delete(package.storage_key(skin_id, assets["ver"], f))
        except AppError:
            pass


def _zip_response(data: bytes, name: str) -> Response:
    return Response(
        data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/skins/export")
async def skins_export(db: Db, format: str = Query("zip", pattern="^(zip|json)$")) -> Response:
    """Portable, kể cả skin đang tắt. `zip` (mặc định): bundle mỗi skin một thư mục
    `<id>/skin.json` + asset — nhập lại được nguyên vẹn (SPEC.md). `json`: chỉ manifest
    (skin gói thì thiếu file, chỉ để xem)."""
    rows = list((await db.execute(select(SkinRow).order_by(SkinRow.sort, SkinRow.id))).scalars())
    if format == "json":
        return JSONResponse({"skins": [package.portable(r.manifest) for r in rows]})
    items = [(r.manifest, await _files_of(r)) for r in rows]
    return _zip_response(
        package.build_bundle(items), f"okia-skins-{datetime.now(UTC):%Y-%m-%d}.zip"
    )


def _validate_manifest(
    raw: dict[str, Any],
    skin_id: str | None = None,
    *,
    files: set[str] | None = None,
) -> dict[str, Any]:
    """Admin được giữ `default` (seed / bundle xuất ra); `_guard_default` chặn làm mất skin
    mặc định. Lỗi → BAD_SKIN kèm mô tả ngắn."""
    try:
        m = package.validate_manifest(raw, files, allow_default=True)
    except package.PackageError as e:
        raise AppError("BAD_SKIN", 400, detail=str(e)[:300]) from e
    if skin_id is not None and m["id"] != skin_id:
        raise AppError("BAD_SKIN", 400, detail="id trong manifest khác id trên URL")
    return m


def _guard_default(row: SkinRow | None, m: dict[str, Any], enabled: bool) -> None:
    """Mỗi loại luôn còn đúng skin mặc định: không tắt, không ghi đè bằng bản không-default,
    không thêm default thứ hai."""
    is_default_row = bool(row and row.manifest.get("default"))
    if m.get("default"):
        if not enabled or (row is not None and not is_default_row):
            raise AppError("SKIN_DEFAULT_PROTECTED", 409)
        if row is None:
            raise AppError("BAD_SKIN", 400, detail="chỉ seed trong repo mới thêm được skin default")
    elif is_default_row:
        raise AppError("SKIN_DEFAULT_PROTECTED", 409)


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


def _keep_assets(row: SkinRow | None, m: dict[str, Any]) -> dict[str, Any]:
    """Manifest JSON (không kèm file) của một skin gói đang có: giữ nguyên asset đã lưu."""
    a = row.manifest.get("assets") if row else None
    if a and package.refs(m):
        return {**m, "assets": {"ver": a["ver"], "files": list(a["files"])}}
    return m


async def _put_manifest(
    db: AsyncSession, raw: dict[str, Any], enabled: bool, sort: int | None, skin_id: str | None
) -> SkinRow:
    """Nhập / ghi đè một manifest JSON (không có file): tham chiếu asset chỉ hợp lệ khi skin ấy
    đã là gói trong DB (giữ file cũ)."""
    rid = raw.get("id") if isinstance(raw, dict) else None
    row = await db.get(SkinRow, rid) if isinstance(rid, str) else None
    have = set((row.manifest.get("assets") or {}).get("files", [])) if row else set()
    if isinstance(raw, dict):
        raw = {k: v for k, v in raw.items() if k != "assets"}
    m = _keep_assets(row, _validate_manifest(raw, skin_id, files=have))
    _guard_default(row, m, enabled)
    return await _upsert(db, m, enabled, sort)


@router.put("/skins/{skin_id}", response_model=AdminSkinOut)
async def skin_put(skin_id: str, body: SkinPutIn, db: Db) -> AdminSkinOut:
    row = await _put_manifest(db, body.manifest, body.enabled, body.sort, skin_id)
    await db.commit()
    await catalog.sync_from_db(db)
    return await _skin_out(db, row)


class SkinMetaIn(CamelModel):
    """Chỉ metadata: tên, mô tả, bậc, bật/tắt, thứ tự. Khối hiệu ứng (`pen`/`box`/`forms`/
    `combo`/`sfx`) và file chỉ đổi được bằng nhập gói / JSON, không sửa tay trên giao diện."""

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
    assets = m.pop("assets", None)
    m = _validate_manifest(m, skin_id, files=set(assets["files"]) if assets else None)
    if assets:
        m["assets"] = assets
    enabled = row.enabled if body.enabled is None else body.enabled
    _guard_default(row, m, enabled)
    row = await _upsert(db, m, enabled, body.sort)
    await db.commit()
    await catalog.sync_from_db(db)
    return await _skin_out(db, row)


@router.get("/skins/{skin_id}/export")
async def skin_export(skin_id: str, db: Db) -> dict[str, Any]:
    """Manifest JSON của một skin (không kèm file — skin gói dùng /package)."""
    row = await db.get(SkinRow, skin_id)
    if row is None:
        raise AppError("NOT_FOUND", 404)
    return package.portable(row.manifest)


@router.get("/skins/{skin_id}/package")
async def skin_package(skin_id: str, db: Db) -> Response:
    """Gói `<id>.okiaskin.zip` (skin.json + asset) — sửa rồi nhập lại được."""
    row = await db.get(SkinRow, skin_id)
    if row is None:
        raise AppError("NOT_FOUND", 404)
    data = package.build(row.manifest, await _files_of(row))
    return _zip_response(data, f"{skin_id}.okiaskin.zip")


@router.delete("/skins/{skin_id}")
async def skin_delete(skin_id: str, db: Db) -> dict[str, bool]:
    row = await db.get(SkinRow, skin_id)
    if row is None:
        raise AppError("NOT_FOUND", 404)
    if row.manifest.get("default"):
        raise AppError("SKIN_DEFAULT_PROTECTED", 409)
    assets = row.manifest.get("assets")
    await db.delete(row)
    await db.commit()
    await catalog.sync_from_db(db)
    await _drop_files(skin_id, assets)
    return {"ok": True}


class SkinsImportIn(CamelModel):
    skins: list[dict[str, Any]]
    # true: xóa những skin không có trong file (trừ default); false: chỉ thêm / ghi đè.
    replace: bool = False


async def _replace_missing(db: AsyncSession, ids: set[str]) -> list[tuple[str, Any]]:
    """Chế độ thay toàn bộ: xóa skin không có trong file (trừ default). Trả asset cần dọn."""
    dropped: list[tuple[str, Any]] = []
    for r in list((await db.execute(select(SkinRow))).scalars()):
        if r.id not in ids and not r.manifest.get("default"):
            dropped.append((r.id, r.manifest.get("assets")))
            await db.delete(r)
    return dropped


@router.post("/skins/import", response_model=list[AdminSkinOut])
async def skins_import(body: SkinsImportIn, db: Db) -> list[AdminSkinOut]:
    """Nhập danh sách manifest JSON (không file). Skin gói đang có trong DB giữ file cũ."""
    ids = {m.get("id") for m in body.skins if isinstance(m, dict)}
    if len(ids) != len(body.skins):
        raise AppError("BAD_SKIN", 400, detail="id trùng trong file")
    for t in catalog.TYPES:
        if body.replace and not any(
            isinstance(m, dict) and m.get("type") == t and m.get("default") for m in body.skins
        ):
            raise AppError("BAD_SKIN", 400, detail=f"thiếu skin default cho {t}")
    for i, raw in enumerate(body.skins):
        await _put_manifest(db, raw, True, i, None)
    dropped = await _replace_missing(db, {str(i) for i in ids}) if body.replace else []
    await db.commit()
    await catalog.sync_from_db(db)
    for sid, a in dropped:
        await _drop_files(sid, a)
    return await skins(db)


@router.post("/skins/import-package", response_model=list[AdminSkinOut])
async def skins_import_package(
    db: Db,
    file: Annotated[UploadFile, File()],
    replace: Annotated[bool, Form()] = False,
) -> list[AdminSkinOut]:
    """Nhập gói zip (một skin hoặc bundle nhiều thư mục — SPEC.md). File ghi lên object storage
    dưới phiên bản theo nội dung; manifest trong DB mang `assets` {ver, files}. Trả về các skin
    vừa nhập."""
    data = await file.read(package.MAX_ZIP + 1)
    try:
        pkgs = package.parse(data, allow_default=True)
    except package.PackageError as e:
        raise AppError("BAD_SKIN", 400, detail=str(e)[:300]) from e
    ids = {p.manifest["id"] for p in pkgs}
    if replace:
        for t in catalog.TYPES:
            if not any(p.manifest["type"] == t and p.manifest.get("default") for p in pkgs):
                raise AppError("BAD_SKIN", 400, detail=f"thiếu skin default cho {t}")
    # Kiểm tra hết trước khi ghi gì (không để nửa bundle).
    rows: dict[str, SkinRow | None] = {}
    for p in pkgs:
        rows[p.manifest["id"]] = await db.get(SkinRow, p.manifest["id"])
        _guard_default(rows[p.manifest["id"]], p.manifest, True)
    st = storage.get_storage()
    old: list[tuple[str, Any]] = []
    out: list[SkinRow] = []
    for i, p in enumerate(pkgs):
        m = dict(p.manifest)
        if p.files:
            ver = package.version(m, p.files)
            for path, blob in p.files.items():
                key = package.storage_key(m["id"], ver, path)
                await st.put(key, blob, package.media_type(path))
            m["assets"] = {"ver": ver, "files": sorted(p.files)}
        row = rows[m["id"]]
        prev = row.manifest.get("assets") if row else None
        if prev and prev.get("ver") != (m.get("assets") or {}).get("ver"):
            old.append((m["id"], prev))
        out.append(await _upsert(db, m, True, i if len(pkgs) > 1 else None))
    dropped = await _replace_missing(db, ids) if replace else []
    await db.commit()
    await catalog.sync_from_db(db)
    for sid, a in old + dropped:
        await _drop_files(sid, a)
    return [await _skin_out(db, r) for r in out]


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
