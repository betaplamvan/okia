/**
 * Store xác thực (zustand) — docs/13: access token giữ trong bộ nhớ, refresh qua cookie httpOnly.
 *
 * Khởi động (boot): thử /auth/refresh; không có phiên → tự đăng nhập khách bằng device id
 * trong localStorage (giống noitu: vào là có tài khoản ngay, không cần màn đăng nhập).
 */
import { create } from "zustand";
import { api, ApiError, type ApiInit, type TokenOut, type User } from "@/lib/api";

const DEVICE_KEY = "okia:device";
const SKEW_MS = 30_000;

export type ProfileTab = "overview" | "account";

type AuthState = {
  status: "idle" | "loading" | "ready" | "offline";
  user: User | null;
  accessToken: string | null;
  expiresAt: number;
  locale: string;
  profileOpen: boolean;
  profileTab: ProfileTab;

  boot(locale: string): Promise<void>;
  /** Gọi API kèm Bearer; hết hạn thì refresh trước, 401 thì refresh rồi thử lại một lần. */
  authed<T>(path: string, init?: ApiInit): Promise<T>;
  refresh(): Promise<User | null>;
  guest(): Promise<void>;
  register(input: { email: string; password: string; displayName?: string }): Promise<TokenOut>;
  login(input: { email: string; password: string }): Promise<TokenOut>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  updateMe(patch: { displayName?: string; locale?: "vi" | "en" }): Promise<User>;
  setPassword(password: string): Promise<User>;
  removeIdentity(provider: "password" | "google"): Promise<User>;
  resendVerify(): Promise<void>;
  forgot(email: string): Promise<void>;
  deleteMe(): Promise<void>;
  googleStart(returnTo: string): Promise<string>;
  applyToken(tok: TokenOut): void;
  openProfile(tab?: ProfileTab): void;
  closeProfile(): void;
};

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
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

  async register(input) {
    const tok = await get().authed<TokenOut>("/auth/register", {
      body: { ...input, locale: get().locale },
    });
    get().applyToken(tok);
    return tok;
  },

  async login(input) {
    const tok = await get().authed<TokenOut>("/auth/login", { body: input });
    get().applyToken(tok);
    return tok;
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

  async setPassword(password) {
    const user = await get().authed<User>("/me/password", { body: { password } });
    set({ user });
    return user;
  },

  async removeIdentity(provider) {
    const user = await get().authed<User>(`/me/identities/${provider}`, { method: "DELETE" });
    set({ user });
    return user;
  },

  async resendVerify() {
    await get().authed("/auth/resend-verify", { method: "POST" });
  },

  async forgot(email) {
    await api("/auth/forgot", { body: { email }, locale: get().locale });
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
  },
  closeProfile() {
    set({ profileOpen: false });
  },
}));
