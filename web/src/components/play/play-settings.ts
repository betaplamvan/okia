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
}

const KEY = "okia-play";
export const DEFAULT_SETTINGS: PlaySettings = {
  mapId: DEFAULT_MAP_ID,
  showLastMove: true,
  strength: 0.65,
  streak: 0,
};

let cached: PlaySettings | null = null;
const listeners = new Set<() => void>();

function sanitizeMapId(p: Partial<PlaySettings> & { size?: unknown }): string {
  if (p.mapId === RANDOM_MAP || POOL.some((m) => m.id === p.mapId)) return p.mapId!;
  // Bản cũ lưu `size: 3 | 5 | 7` (3×3 đã bỏ khỏi bể).
  if (p.size === 7) return "7x7";
  return DEFAULT_SETTINGS.mapId;
}

function sanitize(raw: unknown): PlaySettings {
  const p = (raw ?? {}) as Partial<PlaySettings> & { size?: unknown };
  return {
    mapId: sanitizeMapId(p),
    showLastMove: typeof p.showLastMove === "boolean" ? p.showLastMove : true,
    strength:
      typeof p.strength === "number"
        ? Math.min(1, Math.max(0.2, p.strength))
        : DEFAULT_SETTINGS.strength,
    streak: typeof p.streak === "number" ? p.streak : 0,
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

/** Độ mạnh tự điều chỉnh ngầm (docs/03): ±0.1 sau 3 ván thắng/thua liên tiếp. */
export function adaptAfterResult(s: PlaySettings, humanWon: boolean | null): PlaySettings {
  if (humanWon === null) return { ...s, streak: 0 };
  const streak = humanWon ? Math.max(1, s.streak + 1) : Math.min(-1, s.streak - 1);
  if (streak >= 3) return { ...s, strength: Math.min(1, s.strength + 0.1), streak: 0 };
  if (streak <= -3) return { ...s, strength: Math.max(0.2, s.strength - 0.1), streak: 0 };
  return { ...s, streak };
}
