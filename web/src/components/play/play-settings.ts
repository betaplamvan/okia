/**
 * Cài đặt màn chơi với máy, lưu localStorage, đọc qua useSyncExternalStore
 * (server snapshot = mặc định → không lệch hydration; client đọc giá trị đã lưu sau khi mount).
 */
export const SIZES = [3, 5, 7] as const;
export type Size = (typeof SIZES)[number];

export interface PlaySettings {
  size: Size;
  /** Độ mạnh bot hiện tại (ẩn với người chơi), tự điều chỉnh theo chuỗi thắng/thua. */
  strength: number;
  /** Chuỗi thắng (+) / thua (−) liên tiếp với bot. */
  streak: number;
}

const KEY = "okia-play";
export const DEFAULT_SETTINGS: PlaySettings = { size: 5, strength: 0.65, streak: 0 };

let cached: PlaySettings | null = null;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): PlaySettings {
  const p = (raw ?? {}) as Partial<PlaySettings>;
  return {
    size: SIZES.includes(p.size as Size) ? (p.size as Size) : DEFAULT_SETTINGS.size,
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
