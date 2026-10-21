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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** multipart/form-data (upload) — không JSON hóa, trình duyệt tự đặt Content-Type. */
  form?: FormData;
  token?: string | null;
  locale?: string;
  query?: Record<string, string>;
};

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

export type User = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
  wallet: Wallet;
  email: string | null;
  emailVerified: boolean;
  isGuest: boolean;
  locale: "vi" | "en";
  createdAt: string;
  identities: Identity[];
};

// ---------- Kinh tế (api/app/economy/router.py) ----------

export type Reward = Partial<Wallet>;

export type CheckinOut = {
  checkedToday: boolean;
  streak: number;
  cycleDay: number;
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

// ---------- Xếp hạng (api/app/rating/router.py, docs/07) ----------

export type Tier = "scratch" | "notebook" | "good" | "honor" | "valedictorian";
export const TIERS: Tier[] = ["scratch", "notebook", "good", "honor", "valedictorian"];
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
