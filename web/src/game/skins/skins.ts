/**
 * Catalog skin (docs/08, ADR-0013). Nguồn: shared/skins/**.json → catalog.data.ts (pnpm gen:skins).
 * Hai loại: `pen` (nét vẽ + bộ tiếng ăn ô/combo + kiểu chữ COMBO + vụn) và `box` (hình ô đã ăn).
 * Năm bậc hiếm: trắng → xanh lá → xanh lam → tím → vàng. Giá theo bậc (api/app/skins/catalog.py).
 */
import { SKIN_SOURCES } from "./catalog.data";

export type SkinType = "pen" | "box";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ComboStyle = "sticker" | "ink" | "chalk" | "neon" | "sparkle" | "fire";
export type Particles = "paper" | "ink" | "chalk" | "spark" | "star";
export type BoxEffect =
  "hatch" | "fill" | "crosshatch" | "dots" | "scribble" | "star" | "stamp" | "heart" | "seal";

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
}

export interface ComboParams {
  style: ComboStyle;
  particles: Particles;
  shakeFrom: number;
}

export interface BoxParams {
  effect: BoxEffect;
  alpha: number;
  particles: Particles;
}

interface SkinBase {
  id: string;
  type: SkinType;
  rarity: Rarity;
  name: { vi: string; en: string };
  description: { vi: string; en: string };
  default?: boolean;
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

export const SKINS: readonly SkinManifest[] = SKIN_SOURCES;
export const PENS: readonly PenSkin[] = SKINS.filter((s): s is PenSkin => s.type === "pen");
export const BOXES: readonly BoxSkin[] = SKINS.filter((s): s is BoxSkin => s.type === "box");

const BY_ID = new Map<string, SkinManifest>(SKINS.map((s) => [s.id, s]));

export const DEFAULT_PEN: PenSkin = PENS.find((p) => p.default)!;
export const DEFAULT_BOX: BoxSkin = BOXES.find((b) => b.default)!;

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
