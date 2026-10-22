/**
 * Client gọi API FastAPI (docs/13). Lỗi nghiệp vụ trả `{code, message}` đã dịch → ApiError.
 * Refresh cookie đi kèm nhờ `credentials: "include"` (cookie Path=/auth, SameSite=Lax).
 */

// Không đặt NEXT_PUBLIC_API_URL → dùng cùng host với trang web, cổng 8000. Nhờ vậy máy khác trong
// LAN mở http://192.168.x.x:3000 sẽ tự gọi API ở http://192.168.x.x:8000 (api chạy --host 0.0.0.0).
function defaultBase(): string {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || defaultBase()).replace(/\/$/, "");

/** URL WebSocket tương ứng (http → ws). */
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL || API_BASE.replace(/^http/, "ws")) + "/ws";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** multipart/form-data (upload) — không JSON hóa, trình duyệt tự đặt Content-Type. */
  form?: FormData;
  token?: string | null;
  locale?: string;
  query?: Record<string, string>;
  /** Tải file (zip xuất skin…): trả `ApiBlob` thay vì JSON. */
  blob?: boolean;
};

export type ApiBlob = { blob: Blob; filename: string };

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined && !init.form) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.locale) headers["Accept-Language"] = init.locale;
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs}`, {
      method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
      headers,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      credentials: "include",
    });
  } catch {
    throw new ApiError("NETWORK", "", 0);
  }
  if (init.blob && res.ok) {
    const cd = res.headers.get("content-disposition") ?? "";
    const m = /filename="?([^";]+)"?/.exec(cd);
    return { blob: await res.blob(), filename: m?.[1] ?? "download" } as T;
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new ApiError(
      typeof data.code === "string" ? data.code : "INTERNAL",
      typeof data.message === "string" ? data.message : res.statusText,
      res.status,
      typeof data.retryAfter === "number" ? data.retryAfter : undefined,
    );
  }
  return data as T;
}

// ---------- Kiểu dữ liệu khớp api/app/auth/schemas.py ----------

export type Identity = { provider: "google" };

export type Wallet = { lead: number; flower: number };
export type Currency = keyof Wallet;

export type LoadoutOut = { pen: string; box: string };

export type User = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
  wallet: Wallet;
  loadout: LoadoutOut;
  email: string | null;
  emailVerified: boolean;
  isGuest: boolean;
  /** Email nằm trong ADMIN_EMAILS của API (docs/13 — Admin). */
  isAdmin?: boolean;
  locale: "vi" | "en";
  createdAt: string;
  identities: Identity[];
};

// ---------- Quản trị (api/app/admin/router.py) ----------

export type AdminStats = {
  online: number;
  connections: number;
  roomsPlaying: number;
  queueWaiting: number;
  pendingMatches: number;
  usersTotal: number;
  accountsTotal: number;
  usersToday: number;
  matchesToday: number;
  matchesTotal: number;
  season: { id: number; name: { vi: string; en: string }; startsAt: string; endsAt: string } | null;
  serverTime: number;
};

export type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  locale: string;
  avatarUrl: string | null;
  createdAt: string;
  bannedUntil: string | null;
  deletedAt: string | null;
  lead: number;
  flower: number;
  points: number | null;
  games: number | null;
};

export type AdminUserPage = { items: AdminUser[]; total: number; limit: number; offset: number };

export type AdminMatch = {
  id: string;
  mode: string;
  board: string;
  seat: number;
  opponent: string | null;
  won: boolean | null;
  scores: number[];
  endReason: string;
  pointsDelta: number | null;
  botStrength: number | null;
  endedAt: string;
};

export type AdminUserDetail = AdminUser & {
  mmr: number | null;
  wins: number | null;
  losses: number | null;
  identities: string[];
  matches: AdminMatch[];
};

// ---------- Ủng hộ (docs/10 — Donate) ----------

export type DonateOut = {
  bank: { bin: string; name: string; accountNo: string; accountName: string } | null;
  myCode: string | null;
  thanks: { name: string; month: string; mine: boolean }[];
  count: number;
};

export type AdminDonation = {
  id: string;
  provider: string;
  externalId: string;
  amount: number;
  currency: string;
  content: string;
  donorName: string | null;
  userId: string | null;
  receivedAt: string;
  hidden: boolean;
};
export type AdminDonationPage = { items: AdminDonation[]; total: number; sumVnd: number };

export type AdminSkin = {
  id: string;
  type: string;
  rarity: string;
  enabled: boolean;
  sort: number;
  owners: number;
  updatedAt: string;
  manifest: {
    id: string;
    name?: { vi: string; en: string };
    default?: boolean;
    assets?: { ver: string; files: string[]; base?: string };
  } & Record<string, unknown>;
};

export type AdminConfigValues = {
  ranked_win_lead: number;
  rarity_price: Record<string, Record<string, number>>;
  checkin_rewards: Record<string, number>[];
  mm_bot_after_seconds: number | null;
};

export type AdminConfigOut = { values: AdminConfigValues; defaults: AdminConfigValues };

// ---------- Kinh tế (api/app/economy/router.py) ----------

export type Reward = Partial<Wallet>;

export type CheckinOut = {
  checkedToday: boolean;
  streak: number;
  cycleDay: number;
  /** Kỷ lục chuỗi dài nhất từng đạt. */
  bestStreak: number;
  rewards: Reward[];
  nextReset: number;
};

export type QuestOut = {
  id: string;
  scope: "daily" | "weekly";
  target: number;
  progress: number;
  reward: Reward;
  claimed: boolean;
};

export type ProgressOut = {
  wallet: Wallet;
  canClaim: boolean;
  checkin: CheckinOut;
  quests: QuestOut[];
  dailyReset: number;
  weeklyReset: number;
};

export type RewardOut = { reward: Reward; progress: ProgressOut };

export type TokenOut = {
  accessToken: string;
  expiresIn: number;
  user: User;
  switched: boolean;
};

// ---------- Shop & skin (api/app/skins/router.py, docs/08) ----------

export type MySkinsOut = {
  owned: string[];
  loadout: LoadoutOut;
  wallet: Wallet;
  canBuy: boolean;
};

// ---------- Xếp hạng (api/app/rating/router.py, docs/07) ----------

/** "topscholar" = danh hiệu Trạng nguyên: Thủ khoa trong top 100 BXH (theo vị trí, server gán). */
export type Tier = "scratch" | "notebook" | "good" | "honor" | "valedictorian" | "topscholar";
export const TIERS: Tier[] = [
  "scratch",
  "notebook",
  "good",
  "honor",
  "valedictorian",
  "topscholar",
];
/** Mỗi hạng 300 điểm, 3 bậc × 100 (api/app/rating/points.py). */
export const TIER_SIZE = 300;
export const DIVISION_SIZE = 100;

export type RankOut = { tier: Tier; division?: number | null; points: number };

export type SeasonOut = {
  id: number;
  name: { vi: string; en: string };
  startsAt: string;
  endsAt: string;
};

export type LeaderboardEntry = {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  rank: RankOut;
  games: number;
  wins: number;
};

export type LeaderboardOut = {
  season: SeasonOut;
  placementGames: number;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
};

export type HistoryOut = {
  id: string;
  opponentName: string | null;
  opponentAvatarUrl: string | null;
  won: boolean | null;
  scores: [number, number];
  pointsDelta: number;
  reason: "complete" | "resign" | "afk" | "abandon";
  endedAt: string;
};

export type MyRankOut = {
  season: SeasonOut;
  eligible: boolean;
  rank: RankOut | null;
  points: number;
  peakPoints: number;
  games: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  placementGames: number;
  placementLeft: number;
  position: number | null;
  history: HistoryOut[];
};
