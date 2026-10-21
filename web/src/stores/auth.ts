/**
 * Store xác thực (zustand) — docs/13: access token giữ trong bộ nhớ, refresh qua cookie httpOnly.
 *
 * Khởi động (boot): thử /auth/refresh; không có phiên → tự đăng nhập khách bằng device id
 * trong localStorage (giống noitu: vào là có tài khoản ngay, không cần màn đăng nhập).
 * Chỉ có khách và Google (ADR-0011) — không có mật khẩu.
 */
import { create } from "zustand";
import {
  api,
  ApiError,
  type ApiInit,
  type ProgressOut,
  type Reward,
  type RewardOut,
  type TokenOut,
  type User,
} from "@/lib/api";

const DEVICE_KEY = "okia:device";
const SKEW_MS = 30_000;

export type ProfileTab = "overview" | "quests" | "account";

type AuthState = {
  status: "idle" | "loading" | "ready" | "offline";
  user: User | null;
  accessToken: string | null;
  expiresAt: number;
  locale: string;
  profileOpen: boolean;
  profileTab: ProfileTab;
  /** Ví + điểm danh + nhiệm vụ (GET /me/progress); null khi chưa tải. */
  progress: ProgressOut | null;

  boot(locale: string): Promise<void>;
  /** Gọi API kèm Bearer; hết hạn thì refresh trước, 401 thì refresh rồi thử lại một lần. */
  authed<T>(path: string, init?: ApiInit): Promise<T>;
  refresh(): Promise<User | null>;
  guest(): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  updateMe(patch: { displayName?: string; locale?: "vi" | "en" }): Promise<User>;
  deleteMe(): Promise<void>;
  googleStart(returnTo: string): Promise<string>;
  applyToken(tok: TokenOut): void;
  openProfile(tab?: ProfileTab): void;
  closeProfile(): void;
  loadProgress(): Promise<ProgressOut | null>;
  checkin(): Promise<Reward>;
  claimQuest(id: string): Promise<Reward>;
  /** Ván với máy xong → nuôi nhiệm vụ (bỏ qua với khách). */
  reportBotGame(input: { won: boolean; maxCombo: number; moves: number }): Promise<void>;
  uploadAvatar(file: Blob): Promise<User>;
  deleteAvatar(): Promise<User>;
};

/** UUID v4 không cần secure context (crypto.randomUUID chỉ có trên https/localhost — khi chơi
 *  qua LAN http://192.168.x.x nó undefined). getRandomValues có ở mọi origin. */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return uuid();
  }
}

let bootPromise: Promise<void> | null = null;

export const useAuth = create<AuthState>()((set, get) => ({
  status: "idle",
  user: null,
  accessToken: null,
  expiresAt: 0,
  locale: "vi",
  profileOpen: false,
  profileTab: "overview",
  progress: null,

  applyToken(tok) {
    set({
      user: tok.user,
      accessToken: tok.accessToken,
      expiresAt: Date.now() + tok.expiresIn * 1000,
      status: "ready",
    });
  },

  async boot(locale) {
    set({ locale });
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      set({ status: "loading" });
      try {
        const user = await get().refresh();
        if (!user) await get().guest();
      } catch (e) {
        if (e instanceof ApiError && e.code === "NETWORK") set({ status: "offline" });
        else set({ status: "ready" });
      }
    })();
    return bootPromise;
  },

  async refresh() {
    try {
      const tok = await api<TokenOut>("/auth/refresh", { method: "POST", locale: get().locale });
      get().applyToken(tok);
      return tok.user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        set({ user: null, accessToken: null, expiresAt: 0 });
        return null;
      }
      throw e;
    }
  },

  async guest() {
    const tok = await api<TokenOut>("/auth/guest", {
      body: { deviceId: deviceId(), locale: get().locale },
      locale: get().locale,
    });
    get().applyToken(tok);
  },

  async authed(path, init = {}) {
    const s = get();
    let token = s.accessToken;
    if (token && Date.now() > s.expiresAt - SKEW_MS) {
      token = (await s.refresh()) ? get().accessToken : null;
    }
    try {
      return await api(path, { ...init, token, locale: s.locale });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && token) {
        const user = await s.refresh();
        if (user) return api(path, { ...init, token: get().accessToken, locale: s.locale });
      }
      throw e;
    }
  },

  async logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    set({ user: null, accessToken: null, expiresAt: 0 });
    await get().guest();
  },

  async logoutAll() {
    await get().authed("/auth/logout-all", { method: "POST" });
    set({ user: null, accessToken: null, expiresAt: 0 });
    await get().guest();
  },

  async updateMe(patch) {
    const user = await get().authed<User>("/me", { method: "PATCH", body: patch });
    set({ user });
    return user;
  },

  async deleteMe() {
    await get().authed("/me", { method: "DELETE" });
    set({ user: null, accessToken: null, expiresAt: 0 });
    await get().guest();
  },

  async googleStart(returnTo) {
    const { url } = await get().authed<{ url: string }>("/auth/google/start", {
      method: "POST",
      query: { return_to: returnTo },
    });
    return url;
  },

  openProfile(tab) {
    set({ profileOpen: true, profileTab: tab ?? get().profileTab });
    void get().loadProgress();
  },
  closeProfile() {
    set({ profileOpen: false });
  },

  async loadProgress() {
    const u = get().user;
    if (!u) return null;
    try {
      const progress = await get().authed<ProgressOut>("/me/progress");
      set({ progress, user: { ...u, wallet: progress.wallet } });
      return progress;
    } catch {
      return null;
    }
  },

  async checkin() {
    const out = await get().authed<RewardOut>("/me/checkin", { method: "POST" });
    set({ progress: out.progress, user: { ...get().user!, wallet: out.progress.wallet } });
    return out.reward;
  },

  async claimQuest(id) {
    const out = await get().authed<RewardOut>(`/me/quests/${id}/claim`, { method: "POST" });
    set({ progress: out.progress, user: { ...get().user!, wallet: out.progress.wallet } });
    return out.reward;
  },

  async reportBotGame(input) {
    const u = get().user;
    if (!u || u.isGuest) return;
    try {
      const progress = await get().authed<ProgressOut>("/me/events", {
        body: { type: "bot_game", ...input },
      });
      set({ progress });
    } catch {
      // Không chặn trải nghiệm chơi vì lỗi báo nhiệm vụ.
    }
  },

  async uploadAvatar(file) {
    const form = new FormData();
    form.append("file", file, "avatar.jpg");
    const user = await get().authed<User>("/me/avatar", { form });
    set({ user });
    return user;
  },

  async deleteAvatar() {
    const user = await get().authed<User>("/me/avatar", { method: "DELETE" });
    set({ user });
    return user;
  },
}));
