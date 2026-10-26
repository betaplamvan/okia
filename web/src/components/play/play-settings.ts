/**
 * Cài đặt màn chơi với máy, lưu localStorage, đọc qua useSyncExternalStore
 * (server snapshot = mặc định → không lệch hydration; client đọc giá trị đã lưu sau khi mount).
 */
import { DEFAULT_MAP_ID, POOL, RANDOM_MAP } from "@/game/maps";

export interface PlaySettings {
  /** Id map trong bể hoặc "random" (bốc lại mỗi ván). */
  mapId: string;
  /** Đánh dấu các cạnh máy vừa vẽ. */
  showLastMove: boolean;
  /** Độ mạnh bot hiện tại (ẩn với người chơi), tự điều chỉnh theo chuỗi thắng/thua. */
  strength: number;
  /** Chuỗi thắng (+) / thua (−) liên tiếp với bot. */
  streak: number;
  /** Phiên bản cài đặt (2 = thang độ khó 2026-10-26). */
  v?: number;
}

const KEY = "okia-play";
/** Sàn độ mạnh (docs/03): người mới thua liên tục thì máy dễ tới mức này (lỗi ngớ ngẩn ~25 %). */
export const MIN_STRENGTH = 0.1;
/** Độ mạnh khởi điểm cho người mới (2026-10-26; trước là 0.8 — người mới thua liên tục). */
export const START_STRENGTH = 0.35;
const SETTINGS_VERSION = 2;
export const DEFAULT_SETTINGS: PlaySettings = {
  mapId: DEFAULT_MAP_ID,
  showLastMove: true,
  strength: START_STRENGTH,
  streak: 0,
  v: SETTINGS_VERSION,
};

let cached: PlaySettings | null = null;
const listeners = new Set<() => void>();

function sanitizeMapId(p: Partial<PlaySettings> & { size?: unknown }): string {
  if (p.mapId === RANDOM_MAP || POOL.some((m) => m.id === p.mapId)) return p.mapId!;
  // Bản cũ lưu `size: 3 | 5 | 7` (3×3 đã bỏ khỏi bể).
  if (p.size === 7) return "7x7";
  return DEFAULT_SETTINGS.mapId;
}

/** Chuẩn hoá cài đặt đã lưu (kể cả chuyển bản cũ). Xuất ra để test. */
export function sanitize(raw: unknown): PlaySettings {
  const p = (raw ?? {}) as Partial<PlaySettings> & { size?: unknown };
  let strength =
    typeof p.strength === "number"
      ? Math.min(1, Math.max(MIN_STRENGTH, p.strength))
      : DEFAULT_SETTINGS.strength;
  // Bản cũ (chưa có `v`): ai còn đúng mặc định cũ 0.8 (chưa từng tự điều chỉnh) → thang mới.
  if (p.v !== SETTINGS_VERSION && p.strength === 0.8) strength = START_STRENGTH;
  return {
    mapId: sanitizeMapId(p),
    showLastMove: typeof p.showLastMove === "boolean" ? p.showLastMove : true,
    strength,
    streak: typeof p.streak === "number" ? p.streak : 0,
    v: SETTINGS_VERSION,
  };
}

export function getSettings(): PlaySettings {
  if (cached) return cached;
  try {
    cached = sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

export function getServerSettings(): PlaySettings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(patch: Partial<PlaySettings>): PlaySettings {
  cached = sanitize({ ...getSettings(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* localStorage bị chặn: chỉ giữ trong phiên */
  }
  for (const l of listeners) l();
  return cached;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Độ mạnh tự điều chỉnh ngầm (docs/03): thắng 3 ván liền → +0.1; thua 2 ván liền → −0.1 (xuống
 * nhanh hơn lên, để người mới không nản). Kẹp trong [MIN_STRENGTH, 1].
 */
export function adaptAfterResult(s: PlaySettings, humanWon: boolean | null): PlaySettings {
  if (humanWon === null) return { ...s, streak: 0 };
  const streak = humanWon ? Math.max(1, s.streak + 1) : Math.min(-1, s.streak - 1);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (streak >= 3) return { ...s, strength: round2(Math.min(1, s.strength + 0.1)), streak: 0 };
  if (streak <= -2)
    return { ...s, strength: round2(Math.max(MIN_STRENGTH, s.strength - 0.1)), streak: 0 };
  return { ...s, streak };
}
