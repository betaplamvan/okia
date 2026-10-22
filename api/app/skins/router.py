"""REST shop / kho / trang bị (docs/06 — Shop, ADR-0013).

- GET  /skins            catalog (ai cũng xem được; client đã có bản sinh, endpoint cho bên ngoài)
- GET  /me/skins         skin sở hữu + loadout + ví
- POST /me/skins/{id}/buy  mua lẻ (tài khoản thật)
- PUT  /me/loadout       trang bị (tài khoản thật)
- GET  /skins/assets/{id}/{ver}/{path}  file của gói skin (ADR-0014), immutable
"""

from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.auth.deps import account_user, current_user
from app.auth.schemas import CamelModel
from app.db import get_db
from app.economy import wallet
from app.errors import AppError
from app.models import User
from app.skins import catalog, package, service

router = APIRouter(tags=["skins"])
Db = Annotated[AsyncSession, Depends(get_db)]


class SkinOut(CamelModel):
    id: str
    type: str
    rarity: str
    name: dict[str, str]
    description: dict[str, str]
    default: bool
    price: dict[str, int]
    manifest: dict[str, Any]


class LoadoutOut(CamelModel):
    pen: str
    box: str


class LoadoutIn(CamelModel):
    pen: str | None = None
    box: str | None = None


class MySkinsOut(CamelModel):
    owned: list[str]
    loadout: LoadoutOut
    wallet: dict[str, int]
    can_buy: bool  # tài khoản thật (khách chỉ xem)


def skin_out(s: catalog.Skin) -> SkinOut:
    return SkinOut(
        id=s.id,
        type=s.type,
        rarity=s.rarity,
        name=s.name,
        description=s.description,
        default=s.default,
        price=s.price,
        manifest=s.manifest,
    )


async def my_skins(db: AsyncSession, user: User) -> MySkinsOut:
    return MySkinsOut(
        owned=sorted(await service.owned_ids(db, user.id)),
        loadout=LoadoutOut(**await service.loadout_of(db, user.id)),
        wallet=await wallet.balances(db, user.id),
        can_buy=not user.is_guest,
    )


@router.get("/skins", response_model=list[SkinOut])
async def skins() -> list[SkinOut]:
    return [skin_out(s) for s in catalog.all_skins().values()]


VER_RE = re.compile(r"^[a-f0-9]{10}$")


@router.get("/skins/assets/{skin_id}/{ver}/{path:path}", include_in_schema=False)
async def skin_asset(skin_id: str, ver: str, path: str) -> Response:
    """Ảnh / tiếng của gói skin, khóa theo phiên bản nội dung → cache vĩnh viễn (CDN, trình
    duyệt). SVG được phục vụ với CSP chặn script (phòng mở trực tiếp trên origin API)."""
    if not (catalog.ID_RE.match(skin_id) and VER_RE.match(ver) and package.ASSET_RE.match(path)):
        raise AppError("NOT_FOUND", 404)
    data = await storage.get_storage().get(package.storage_key(skin_id, ver, path))
    if data is None:
        raise AppError("NOT_FOUND", 404)
    headers = {
        "Cache-Control": storage.CACHE_IMMUTABLE,
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
    }
    if path.endswith(".svg"):
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    return Response(content=data, media_type=package.media_type(path), headers=headers)


@router.get("/me/skins", response_model=MySkinsOut, tags=["me"])
async def me_skins(db: Db, user: Annotated[User, Depends(current_user)]) -> MySkinsOut:
    return await my_skins(db, user)


@router.post("/me/skins/{skin_id}/buy", response_model=MySkinsOut, tags=["me"])
async def me_buy(skin_id: str, db: Db, user: Annotated[User, Depends(account_user)]) -> MySkinsOut:
    await service.buy(db, user.id, skin_id)
    await db.commit()
    return await my_skins(db, user)


@router.put("/me/loadout", response_model=MySkinsOut, tags=["me"])
async def me_loadout(
    body: LoadoutIn, db: Db, user: Annotated[User, Depends(account_user)]
) -> MySkinsOut:
    await service.equip(db, user.id, pen=body.pen, box=body.box)
    await db.commit()
    return await my_skins(db, user)
