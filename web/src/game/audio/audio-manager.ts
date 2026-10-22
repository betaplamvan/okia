/**
 * AudioManager (docs/08 — Âm thanh): Howler + audio sprite (core.webm/mp3 + core.json do
 * scripts/build-audio.mjs sinh) và nhạc nền loop. Chỉ chạy ở trình duyệt; howler được import động.
 *
 * - Hiệu ứng: play(name) / playDraw() / playCapture(combo) — cao độ tăng dần theo combo.
 * - Tiếng của gói skin (ADR-0014): file lẻ theo URL, nạp trước bằng loadSfx(); lỗi tải → rơi về
 *   tiếng mặc định trong sprite.
 * - Nhạc nền: chỉ bắt đầu sau cử chỉ đầu tiên của người dùng (chính sách autoplay), fade in.
 * - Theo dõi store cài đặt để bật/tắt và chỉnh âm lượng ngay lập tức.
 */
import type { Howl as HowlType } from "howler";
import { getAudioSettings, subscribeAudioSettings, type AudioSettings } from "./audio-settings";

type SpriteMap = Record<string, [number, number]>;
const BASE = "/assets/audio";
const DRAW_VARIANTS = ["draw_01", "draw_02", "draw_03"];
const isUrl = (name: string) => /^(https?:)?\/\//.test(name) || name.startsWith("/");

/** Tiếng ngoài sprite (gói skin): một Howl mỗi URL; `ok` null = đang nạp, false = lỗi. */
interface ExtraSfx {
  howl: HowlType;
  ok: boolean | null;
}

class AudioManager {
  private sfx: HowlType | null = null;
  private music: HowlType | null = null;
  private musicTrack: string | null = null;
  private initPromise: Promise<void> | null = null;
  private unlocked = false;
  private unsubscribe: (() => void) | null = null;
  private lastDraw = -1;
  private extra = new Map<string, ExtraSfx>();

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
    for (const e of this.extra.values()) e.howl.mute(!s.sfxOn);
    this.syncMusic(s);
  }

  /** Nạp trước một tiếng ngoài sprite (URL trong gói skin). Gọi lại nhiều lần vô hại. */
  async loadSfx(url: string, ext?: string): Promise<void> {
    if (typeof window === "undefined" || !isUrl(url) || this.extra.has(url)) return;
    const { Howl } = await import("howler");
    if (this.extra.has(url)) return;
    const entry: ExtraSfx = {
      // blob: URL (xem trước gói ở admin) không có đuôi → Howler cần `format`.
      howl: new Howl({ src: [url], preload: true, ...(ext ? { format: [ext] } : {}) }),
      ok: null,
    };
    entry.howl.once("load", () => {
      entry.ok = true;
    });
    entry.howl.once("loaderror", () => {
      entry.ok = false;
    });
    entry.howl.mute(!getAudioSettings().sfxOn);
    this.extra.set(url, entry);
  }

  /** Phát tiếng ngoài sprite; false nếu chưa nạp / lỗi (caller dùng tiếng mặc định). */
  private playExtra(url: string, opts: { rate?: number; volume?: number }): boolean {
    const e = this.extra.get(url);
    if (!e || e.ok === false) return false;
    const s = getAudioSettings();
    if (!s.sfxOn) return true;
    const id = e.howl.play();
    if (opts.rate) e.howl.rate(opts.rate, id);
    e.howl.volume(s.sfxVolume * (opts.volume ?? 1), id);
    return true;
  }

  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  private async syncMusic(s: AudioSettings) {
    if (!this.unlocked) return;
    // Hủy lệnh pause còn chờ từ lần tắt trước, nếu không bật lại nhanh sẽ bị im.
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (!s.musicOn) {
      if (this.music?.playing()) {
        this.music.fade(this.music.volume(), 0, 300);
        this.pauseTimer = setTimeout(() => {
          this.music?.pause();
          this.pauseTimer = null;
        }, 320);
      }
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
    const music = this.music;
    const target = s.musicVolume;
    if (music.playing()) {
      music.fade(music.volume(), target, 300);
      return;
    }
    // play() với HTML5 Audio là bất đồng bộ và đặt lại volume đã lưu (0 sau fade-out) khi bắt đầu,
    // nên fade lên chỉ được gọi sau sự kiện "play" — nếu không âm lượng kẹt ở 0.
    music.volume(0);
    music.off("play");
    music.once("play", () => music.fade(0, target, 400));
    music.play();
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

  /** Có tiếng này trong sprite không (skin tham chiếu tên lạ → dùng tiếng mặc định). */
  private spriteOr(name: string, fallback: string): string {
    const sprite = (this.sfx as unknown as { _sprite?: Record<string, unknown> } | null)?._sprite;
    return sprite && name in sprite ? name : fallback;
  }

  /**
   * "Ting" ăn ô (tiếng của skin bút, docs/08): ô thứ n trong lượt cao hơn, tối đa ×1.6.
   * `sprite` là tên trong sprite hoặc URL file của gói skin.
   */
  playCapture(combo: number, sprite = "capture"): void {
    const rate = Math.min(1.6, 1 + 0.08 * Math.max(0, combo - 1));
    if (isUrl(sprite) && this.playExtra(sprite, { rate })) return;
    this.play(this.spriteOr(sprite, "capture"), { rate });
  }

  /** Tiếng COMBO (ô thứ n ≥ 2 trong lượt), theo skin bút: cao dần, tối đa ×1.5. */
  playCombo(combo: number, sprite = "combo"): void {
    const rate = Math.min(1.5, 1 + 0.06 * Math.max(0, combo - 2));
    if (isUrl(sprite) && this.playExtra(sprite, { rate, volume: 0.85 })) return;
    this.play(this.spriteOr(sprite, "combo"), { rate, volume: 0.85 });
  }

  /** Tiếng đếm ô cuối ván: "pop" ngắn, cao dần theo số đếm. */
  playCount(n: number): void {
    this.play("count", { rate: Math.min(2, 1 + 0.025 * n), volume: 0.55 });
  }

  playUi(kind: "click" | "confirm" | "back" | "error" | "open" | "close" = "click"): void {
    this.play(`ui_${kind}`, { volume: 0.6 });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.sfx?.unload();
    this.music?.unload();
    for (const e of this.extra.values()) e.howl.unload();
    this.extra.clear();
    this.sfx = null;
    this.music = null;
    this.initPromise = null;
  }
}

/** Singleton dùng chung toàn app (client). */
export const audio = new AudioManager();
