/**
 * AudioManager (docs/08 — Âm thanh): Howler + audio sprite (core.webm/mp3 + core.json do
 * scripts/build-audio.mjs sinh) và nhạc nền loop. Chỉ chạy ở trình duyệt; howler được import động.
 *
 * - Hiệu ứng: play(name) / playDraw() / playCapture(combo) — cao độ tăng dần theo combo.
 * - Nhạc nền: chỉ bắt đầu sau cử chỉ đầu tiên của người dùng (chính sách autoplay), fade in.
 * - Theo dõi store cài đặt để bật/tắt và chỉnh âm lượng ngay lập tức.
 */
import type { Howl as HowlType } from "howler";
import { getAudioSettings, subscribeAudioSettings, type AudioSettings } from "./audio-settings";

type SpriteMap = Record<string, [number, number]>;
const BASE = "/assets/audio";
const DRAW_VARIANTS = ["draw_01", "draw_02", "draw_03"];

class AudioManager {
  private sfx: HowlType | null = null;
  private music: HowlType | null = null;
  private musicTrack: string | null = null;
  private initPromise: Promise<void> | null = null;
  private unlocked = false;
  private unsubscribe: (() => void) | null = null;
  private lastDraw = -1;

  /** Gọi một lần ở client (AudioProvider). An toàn khi gọi nhiều lần. */
  init(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const [{ Howl }, manifest] = await Promise.all([
        import("howler"),
        fetch(`${BASE}/core.json`).then((r) => (r.ok ? r.json() : { sprite: {} })),
      ]);
      const sprite = (manifest as { sprite: SpriteMap }).sprite;
      this.sfx = new Howl({
        src: [`${BASE}/core.webm`, `${BASE}/core.mp3`],
        sprite,
        preload: true,
      });
      this.applySettings(getAudioSettings());
      this.unsubscribe = subscribeAudioSettings(() => this.applySettings(getAudioSettings()));
      // Nhạc nền chỉ được phép sau cử chỉ người dùng.
      const unlock = () => {
        this.unlocked = true;
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        this.syncMusic(getAudioSettings());
      };
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("keydown", unlock);
    })();
    return this.initPromise;
  }

  private applySettings(s: AudioSettings) {
    if (this.sfx) this.sfx.mute(!s.sfxOn);
    this.syncMusic(s);
  }

  private async syncMusic(s: AudioSettings) {
    if (!this.unlocked) return;
    if (!s.musicOn) {
      this.music?.fade(this.music.volume(), 0, 300);
      setTimeout(() => this.music?.pause(), 320);
      return;
    }
    if (!this.music || this.musicTrack !== s.track) {
      this.music?.unload();
      const { Howl } = await import("howler");
      this.musicTrack = s.track;
      this.music = new Howl({
        src: [`${BASE}/music/${s.track}.webm`, `${BASE}/music/${s.track}.mp3`],
        loop: true,
        html5: true, // stream file dài, không giải mã toàn bộ vào bộ nhớ
        volume: 0,
      });
    }
    if (!this.music.playing()) this.music.play();
    this.music.fade(this.music.volume(), s.musicVolume, 400);
  }

  /** Phát một tiếng trong sprite. `rate` 0.5–4 đổi cao độ/tốc độ. */
  play(name: string, opts: { rate?: number; volume?: number } = {}): void {
    const s = getAudioSettings();
    if (!this.sfx || !s.sfxOn) return;
    const id = this.sfx.play(name);
    if (opts.rate) this.sfx.rate(opts.rate, id);
    this.sfx.volume(s.sfxVolume * (opts.volume ?? 1), id);
  }

  /** Tiếng bút: xoay vòng 3 biến thể, cao độ lệch nhẹ để không nhàm. */
  playDraw(): void {
    let i = Math.floor(Math.random() * DRAW_VARIANTS.length);
    if (i === this.lastDraw) i = (i + 1) % DRAW_VARIANTS.length;
    this.lastDraw = i;
    this.play(DRAW_VARIANTS[i], { rate: 0.94 + Math.random() * 0.12 });
  }

  /** "Ting" ăn ô: ô thứ n trong một lượt cao hơn (đồ–rê–mi…), tối đa ×1.6. */
  playCapture(combo: number): void {
    const rate = Math.min(1.6, 1 + 0.08 * Math.max(0, combo - 1));
    this.play("capture", { rate });
  }

  playUi(kind: "click" | "confirm" | "back" | "error" | "open" | "close" = "click"): void {
    this.play(`ui_${kind}`, { volume: 0.6 });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.sfx?.unload();
    this.music?.unload();
    this.sfx = null;
    this.music = null;
    this.initPromise = null;
  }
}

/** Singleton dùng chung toàn app (client). */
export const audio = new AudioManager();
