/**
 * Store xác thực (zustand) — docs/13: access token giữ trong bộ nhớ, refresh qua cookie httpOnly.
 *
 * Khởi động (boot): thử /auth/refresh; không có phiên → tự đăng nhập khách bằng device id
 * trong localStorage (giống noitu: vào là có tài khoản ngay, không cần màn đăng nhập).
 * Chỉ có khách và Google (ADR-0011) — không có mật khẩu.
 *
 * Một phiên mỗi tài khoản (docs/13): tài khoản đăng nhập nơi khác → refresh ở đây trả
 * SESSION_REPLACED → chuyển về khách và bật `sessionReplaced` để hiện hộp thông báo.
 */
import { create } from "zustand";
import type { SkinManifest } from "@/game/skins/skins";
import { useCatalog } from "@/stores/catalog";
import {
  api,
  ApiError,
  type ApiInit,
  type MyRankOut,
  type MySkinsOut,
  type ProgressOut,
  type Reward,
  type RewardOut,
  type TokenOut,
  type User,
  type SiteConfig,
} from "@/lib/api";

const DEVICE_KEY = "okia:device";
/** Tab nào nhận SESSION_REPLACED thì ghi khóa này: các tab cùng trình duyệt (sự kiện `storage`) cũng
 *  báo, vì cookie chung đã thành cookie khách và refresh ở đó sẽ lặng lẽ ra khách. */
export const SESSION_REPLACED_KEY = "okia:session-replaced";
const SKEW_MS = 30_000;

export type ProfileTab = "overview" | "rank" | "account";
/** Hộp "Quà mỗi ngày" (nút hộp quà trang chủ): điểm danh / nhiệm vụ. */
export type GiftTab = "checkin" | "quests";

export type AuthState = {
  status: "idle" | "loading" | "ready" | "offline";
  user: User | null;
  accessToken: string | null;
  /** Thông số public (GET /site): vùng quảng cáo giả đang bật? */
  site: SiteConfig;
  expiresAt: number;
  locale: string;
  profileOpen: boolean;
  profileTab: ProfileTab;
  giftOpen: boolean;
  giftTab: GiftTab;
  /** Ví + điểm danh + nhiệm vụ (GET /me/progress); null khi chưa tải. */
  progress: ProgressOut | null;
  /** Hạng mùa này + lịch sử trận xếp hạng (GET /me/rank); null khi chưa tải. */
  rank: MyRankOut | null;
  /** Skin sở hữu + đang trang bị (GET /me/skins); null khi chưa tải. */
  skins: MySkinsOut | null;
  /** Tài khoản vừa đăng nhập nơi khác, phiên ở đây đã bị thay (đã về khách) → hiện thông báo. */
  sessionReplaced: boolean;

  boot(locale: string): Promise<void>;
  /** Gọi API kèm Bearer; hết hạn thì refresh trước, 401 thì refresh rồi thử lại một lần. */
  authed<T>(path: string, init?: ApiInit): Promise<T>;
  /** Làm mới phiên. Phiên bị thay ở nơi khác → về khách, trả user khách. */
  refresh(): Promise<User | null>;
  /** Tài khoản thật: hỏi /me để biết phiên còn sống (tab quay lại, định kỳ). */
  checkSession(): Promise<void>;
  /** Tab khác cùng trình duyệt vừa nhận SESSION_REPLACED. */
  replacedInOtherTab(): Promise<void>;
  dismissSessionReplaced(): void;
  guest(): Promise<void>;
  /** Tải lại thông số public (GET /site) — lúc boot và mỗi lần quay lại tab. */
  loadSite(): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  updateMe(patch: { displayName?: string; locale?: "vi" | "en" }): Promise<User>;
  deleteMe(): Promise<void>;
  googleStart(returnTo: string): Promise<string>;
  applyToken(tok: TokenOut): void;
  openProfile(tab?: ProfileTab): void;
  closeProfile(): void;
  openGift(tab?: GiftTab): void;
  closeGift(): void;
  loadProgress(): Promise<ProgressOut | null>;
  loadRank(): Promise<MyRankOut | null>;
  loadSkins(): Promise<MySkinsOut | null>;
  buySkin(id: string): Promise<MySkinsOut>;
  equipSkin(patch: { pen?: string; box?: string }): Promise<MySkinsOut>;
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
// Một lần refresh tại một thời điểm: REST 401 và WS 4409 cùng lúc mà mỗi bên tự xoay cookie thì bên
// chậm gửi token vừa bị xoay → server coi là dùng lại token và thu hồi cả phiên.
let refreshPromise: Promise<User | null> | null = null;

export const useAuth = create<AuthState>()((set, get) => ({
  status: "idle",
  user: null,
  accessToken: null,
  site: { adsMock: false },
  expiresAt: 0,
  locale: "vi",
  profileOpen: false,
  profileTab: "overview",
  giftOpen: false,
  giftTab: "checkin",
  progress: null,
  rank: null,
  skins: null,
  sessionReplaced: false,

  applyToken(tok) {
    const prev = get().user;
    set({
      user: tok.user,
      accessToken: tok.accessToken,
      expiresAt: Date.now() + tok.expiresIn * 1000,
      status: "ready",
      // Đổi người (khách → tài khoản, đăng xuất) → dữ liệu hạng/tiến trình cũ không còn đúng.
      ...(prev && prev.id !== tok.user.id ? { rank: null, progress: null, skins: null } : {}),
    });
  },

  async boot(locale) {
    set({ locale });
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      set({ status: "loading" });
      void get().loadSite();
      // Catalog skin thật (DB) — không chặn đăng nhập; lỗi thì dùng bản biên dịch.
      void api<{ manifest: SkinManifest }[]>("/skins", { locale })
        .then((list) => useCatalog.getState().setCatalog(list.map((s) => s.manifest)))
        .catch(() => {});
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

  refresh() {
    refreshPromise ??= (async () => {
      try {
        const tok = await api<TokenOut>("/auth/refresh", { method: "POST", locale: get().locale });
        get().applyToken(tok);
        return tok.user;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        set({ user: null, accessToken: null, expiresAt: 0 });
        if (e.code !== "SESSION_REPLACED") return null;
        set({ sessionReplaced: true, profileOpen: false, giftOpen: false });
        try {
          localStorage.setItem(SESSION_REPLACED_KEY, String(Date.now()));
        } catch {
          // Không có localStorage: tab khác sẽ tự phát hiện ở lần refresh sau.
        }
        await get().guest();
        return get().user;
      }
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  },

  async loadSite() {
    try {
      set({ site: await api<SiteConfig>("/site", { locale: get().locale }) });
    } catch {
      // Mạng lỗi: giữ giá trị cũ, lần quay lại tab sau thử lại.
    }
  },

  async checkSession() {
    // Admin vừa bật / tắt vùng quảng cáo giả → tab đang mở cũng cập nhật, không cần tải lại trang.
    void get().loadSite();
    const u = get().user;
    if (!u || u.isGuest) return;
    try {
      const user = await get().authed<User>("/me");
      if (get().user?.id === user.id) set({ user });
    } catch {
      // Mạng lỗi: lần sau kiểm tra lại. Phiên bị thay đã được refresh() xử lý.
    }
  },

  async replacedInOtherTab() {
    const u = get().user;
    if (!u || u.isGuest) return;
    set({ sessionReplaced: true, profileOpen: false, giftOpen: false });
    const user = await get()
      .refresh()
      .catch(() => null);
    if (!user)
      await get()
        .guest()
        .catch(() => undefined);
  },

  dismissSessionReplaced() {
    set({ sessionReplaced: false });
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
    void get().loadRank();
  },
  closeProfile() {
    set({ profileOpen: false });
  },

  openGift(tab) {
    set({ giftOpen: true, giftTab: tab ?? get().giftTab });
    void get().loadProgress();
  },
  closeGift() {
    set({ giftOpen: false });
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

  async loadRank() {
    if (!get().user) return null;
    try {
      const rank = await get().authed<MyRankOut>("/me/rank");
      set({ rank });
      return rank;
    } catch {
      return null;
    }
  },

  async loadSkins() {
    if (!get().user) return null;
    try {
      const skins = await get().authed<MySkinsOut>("/me/skins");
      set({ skins });
      return skins;
    } catch {
      return null;
    }
  },

  async buySkin(id) {
    const skins = await get().authed<MySkinsOut>(`/me/skins/${id}/buy`, { method: "POST" });
    set({ skins, user: { ...get().user!, wallet: skins.wallet } });
    return skins;
  },

  async equipSkin(patch) {
    const skins = await get().authed<MySkinsOut>("/me/loadout", { method: "PUT", body: patch });
    set({ skins, user: { ...get().user!, loadout: skins.loadout } });
    return skins;
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
