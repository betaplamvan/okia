/**
 * Catalog skin (docs/08, ADR-0013, ADR-0014). Nguồn: shared/skins/**.json → catalog.data.ts
 * (pnpm gen:skins); lúc chạy thay bằng catalog từ API (skin admin nhập, kể cả gói zip có file).
 * Hai loại: `pen` (nét vẽ + bộ tiếng ăn ô/combo + kiểu chữ COMBO + vụn) và `box` (hình ô đã ăn).
 * Năm bậc hiếm: trắng → xanh lá → xanh lam → tím → vàng. Giá theo bậc (api/app/skins/catalog.py).
 * Định dạng chuẩn: shared/skins/schema.json + SPEC.md.
 */
import { SKIN_SOURCES } from "./catalog.data";

export type SkinType = "pen" | "box";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ComboStyle = "sticker" | "ink" | "chalk" | "neon" | "sparkle" | "fire";
/** Loại vụn; `image` = ảnh `particleImage` trong gói skin (nhuộm theo màu bút). */
export type Particles = "paper" | "ink" | "chalk" | "spark" | "star" | "heart" | "image";
/** Hình ô đã ăn (docs/08): mỗi hiệu ứng có hình, animation hiện và (một số) hiệu ứng sống. */
export type BoxEffect =
  | "hatch"
  | "fill"
  | "crosshatch"
  | "dots"
  | "scribble"
  | "star"
  | "stamp"
  | "heart"
  | "seal"
  | "flower"
  | "flame"
  | "image";

/** Kiểu vẽ nét (docs/08 — "pen.style"): quyết định cách engine dùng màu của hình thái. */
export type PenStyle =
  "flat" | "twotone" | "gradient" | "neon" | "brush" | "fire" | "rainbow" | "metal";

/**
 * Một hình thái màu của bút (docs/08 — "forms"). Mỗi bút có hai: `mine` tông lạnh (nét của mình),
 * `opponent` tông nóng (nét đối thủ) — cả hai bên đều thấy nét mình lạnh, nét đối thủ nóng.
 */
export interface PenForm {
  /** Màu chính (hex). */
  color: string;
  /** Màu cuối gradient (gradient, brush, fire, phấn). */
  color2?: string;
  /** Các mốc màu nhiều điểm (rainbow, metal). */
  colors?: string[];
  /** Màu quầng sáng (neon, metal). */
  glow?: string;
  /** Màu lõi sáng ở giữa nét (neon). */
  core?: string;
  /** Màu hạt sáp / vụn phụ (crayon). */
  accent?: string;
}

export interface PenParams {
  style: PenStyle;
  /** Hệ số bề dày so với nét mặc định. */
  width: number;
  alpha?: number;
  /** Hệ số độ run tay (1 = mặc định). */
  jitter?: number;
  cap?: "round" | "square";
  /** Nét mảnh ở hai đầu, dày ở giữa (bút lông, mực). */
  taper?: boolean;
  /** Nét đứt quãng: [đoạn vẽ, đoạn hở] theo tỷ lệ ô. */
  dash?: [number, number];
  /** Hạt dọc nét: `graphite` (vệt chì mảnh, bút chì) · `wax` (chấm sáp sẫm màu `accent`, sáp màu). */
  grain?: "graphite" | "wax";
  /** Quầng bụi màu `color2` rộng, mờ dưới nét (phấn). */
  halo?: boolean;
  /** Ảnh lặp phủ lên nét (gói skin: `pen/<tên>.png`), nhuộm theo màu hình thái. */
  texture?: string;
  /** Tỷ lệ ảnh lặp (1 = 1 px ảnh ≈ 1 px màn). */
  textureScale?: number;
}

export interface ComboParams {
  style: ComboStyle;
  particles: Particles;
  /** Ảnh vụn khi `particles` = image (gói skin: `particles/<tên>.svg`). */
  particleImage?: string;
  shakeFrom: number;
}

export interface BoxParams {
  effect: BoxEffect;
  alpha: number;
  particles: Particles;
  particleImage?: string;
  /** Hình tô vào ô khi `effect` = image (gói skin: `box/<tên>.svg`). */
  image?: string;
  /** image: nhuộm theo màu bút người ăn (mặc định true). */
  tint?: boolean;
  /** image: cỡ ảnh so với ô (mặc định 0.9). */
  scale?: number;
}

/** File đi kèm gói skin, do API ghi khi nhập: `base` là URL gốc để tải `files`. */
export interface SkinAssets {
  ver: string;
  files: string[];
  base?: string;
  /** Chỉ client: URL cục bộ (blob:) khi xem trước gói chưa nhập ở admin — ưu tiên hơn `base`. */
  urls?: Record<string, string>;
}

export interface SkinBase {
  schema?: 1;
  id: string;
  type: SkinType;
  rarity: Rarity;
  name: { vi: string; en: string };
  description: { vi: string; en: string };
  default?: boolean;
  author?: string;
  license?: string;
  assets?: SkinAssets;
}

export interface PenSkin extends SkinBase {
  type: "pen";
  forms: { mine: PenForm; opponent: PenForm };
  pen: PenParams;
  combo: ComboParams;
  sfx: { capture: string; combo: string };
}

export interface BoxSkin extends SkinBase {
  type: "box";
  box: BoxParams;
}

export type SkinManifest = PenSkin | BoxSkin;

/** Bản biên dịch (seed). Lúc chạy, catalog thật từ API thay vào qua `registerSkins` (stores/catalog). */
export const SKINS: readonly SkinManifest[] = SKIN_SOURCES;
export const PENS: readonly PenSkin[] = SKINS.filter((s): s is PenSkin => s.type === "pen");
export const BOXES: readonly BoxSkin[] = SKINS.filter((s): s is BoxSkin => s.type === "box");

const BY_ID = new Map<string, SkinManifest>(SKINS.map((s) => [s.id, s]));

export const DEFAULT_PEN: PenSkin = PENS.find((p) => p.default)!;
export const DEFAULT_BOX: BoxSkin = BOXES.find((b) => b.default)!;

/**
 * Thay bảng tra bằng catalog từ API (admin thêm/sửa/tắt skin không cần deploy web). Skin default
 * biên dịch vẫn là dự phòng nếu danh sách thiếu. Trả false nếu danh sách không dùng được.
 */
export function registerSkins(list: readonly SkinManifest[]): boolean {
  if (
    !list.some((s) => s.type === "pen" && s.default) ||
    !list.some((s) => s.type === "box" && s.default)
  )
    return false;
  BY_ID.clear();
  for (const s of list) BY_ID.set(s.id, s);
  return true;
}

/** Chuỗi là tham chiếu file trong gói (`sfx/…`, `box/…`, `particles/…`, `pen/…`)? */
export function isAssetRef(ref: string | null | undefined): ref is string {
  return typeof ref === "string" && /^(sfx|box|particles|pen)\/[a-z0-9_-]+\.[a-z0-9]+$/.test(ref);
}

/** URL của một file trong gói skin (blob cục bộ khi xem trước, hoặc `base` + đường dẫn); null nếu không
 * phải tham chiếu, skin không có gói, hoặc file không có trong gói. */
export function assetUrl(skin: SkinBase, ref: string | null | undefined): string | null {
  if (!isAssetRef(ref) || !skin.assets) return null;
  const local = skin.assets.urls?.[ref];
  if (local) return local;
  if (!skin.assets.base || !skin.assets.files.includes(ref)) return null;
  return `${skin.assets.base.replace(/\/$/, "")}/${ref}`;
}

/** URL + đuôi file (blob: không có đuôi → bộ nạp cần biết loại). */
export interface AssetUrl {
  url: string;
  ext: string;
}

/** Mọi ảnh / tiếng mà một skin cần nạp trước khi vào trận. */
export function skinAssetUrls(skin: SkinManifest): { images: AssetUrl[]; sounds: AssetUrl[] } {
  const images: AssetUrl[] = [];
  const sounds: AssetUrl[] = [];
  const add = (list: AssetUrl[], ref: string | undefined) => {
    const url = assetUrl(skin, ref);
    if (url && !list.some((a) => a.url === url))
      list.push({ url, ext: (ref as string).split(".").pop() ?? "" });
  };
  if (skin.type === "pen") {
    add(images, skin.pen.texture);
    add(images, skin.combo.particleImage);
    add(sounds, skin.sfx.capture);
    add(sounds, skin.sfx.combo);
  } else {
    add(images, skin.box.image);
    add(images, skin.box.particleImage);
  }
  return { images, sounds };
}

export interface Loadout {
  pen: string;
  box: string;
}
export const DEFAULT_LOADOUT: Loadout = { pen: DEFAULT_PEN.id, box: DEFAULT_BOX.id };

export function getSkin(id: string): SkinManifest | undefined {
  return BY_ID.get(id);
}
export function penOf(id: string | null | undefined): PenSkin {
  const s = id ? BY_ID.get(id) : undefined;
  return s?.type === "pen" ? s : DEFAULT_PEN;
}
export function boxOf(id: string | null | undefined): BoxSkin {
  const s = id ? BY_ID.get(id) : undefined;
  return s?.type === "box" ? s : DEFAULT_BOX;
}

/** Hình thái của bút theo phía nhìn: nét của mình (`isMine`) tông lạnh, nét đối thủ tông nóng. */
export function penForm(pen: PenSkin, isMine: boolean): PenForm {
  return isMine ? pen.forms.mine : pen.forms.opponent;
}

/** Bộ skin áp vào bàn theo ghế 0/1 (mỗi bên thấy bút/ô của chính người vẽ). */
export interface SeatSkins {
  pens: [PenSkin, PenSkin];
  boxes: [BoxSkin, BoxSkin];
}
export function seatSkins(
  l0: Partial<Loadout> | null | undefined,
  l1: Partial<Loadout> | null | undefined,
): SeatSkins {
  return {
    pens: [penOf(l0?.pen), penOf(l1?.pen)],
    boxes: [boxOf(l0?.box), boxOf(l1?.box)],
  };
}

/** Giá theo bậc hiếm (khớp api/app/skins/catalog.py). Skin default miễn phí. */
export const RARITY_PRICE: Record<Rarity, { lead?: number; flower?: number }> = {
  common: { lead: 100 },
  uncommon: { lead: 250 },
  rare: { lead: 600 },
  epic: { lead: 1500 },
  legendary: { flower: 5 },
};
export const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
/** Màu bậc hiếm (docs/08): trắng, xanh lá, xanh lam, tím, vàng. */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#fffcf2",
  uncommon: "#7cf5c5",
  rare: "#8ec5ff",
  epic: "#c9a7ff",
  legendary: "#ffd93d",
};
