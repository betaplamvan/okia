/**
 * Cài đặt âm thanh (docs/08 — Âm thanh): hai kênh nhạc nền / hiệu ứng, mỗi kênh bật-tắt + âm lượng.
 * Lưu localStorage, đọc qua useSyncExternalStore (server snapshot = mặc định).
 */
export interface AudioSettings {
  musicOn: boolean;
  musicVolume: number; // 0..1
  sfxOn: boolean;
  sfxVolume: number; // 0..1
  track: string;
}

const KEY = "okia-audio";
export const DEFAULT_AUDIO: AudioSettings = {
  musicOn: true,
  musicVolume: 0.35,
  sfxOn: true,
  sfxVolume: 0.8,
  track: "childhood-friends",
};

let cached: AudioSettings | null = null;
const listeners = new Set<() => void>();

const clamp01 = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;

function sanitize(raw: unknown): AudioSettings {
  const p = (raw ?? {}) as Partial<AudioSettings>;
  return {
    musicOn: typeof p.musicOn === "boolean" ? p.musicOn : DEFAULT_AUDIO.musicOn,
    musicVolume: clamp01(p.musicVolume, DEFAULT_AUDIO.musicVolume),
    sfxOn: typeof p.sfxOn === "boolean" ? p.sfxOn : DEFAULT_AUDIO.sfxOn,
    sfxVolume: clamp01(p.sfxVolume, DEFAULT_AUDIO.sfxVolume),
    track: typeof p.track === "string" && p.track ? p.track : DEFAULT_AUDIO.track,
  };
}

export function getAudioSettings(): AudioSettings {
  if (cached) return cached;
  try {
    cached = sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    cached = DEFAULT_AUDIO;
  }
  return cached;
}

export const getServerAudioSettings = (): AudioSettings => DEFAULT_AUDIO;

export function updateAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  cached = sanitize({ ...getAudioSettings(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* localStorage bị chặn: chỉ giữ trong phiên */
  }
  for (const l of listeners) l();
  return cached;
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
