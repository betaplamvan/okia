/**
 * Client gọi API FastAPI (docs/13). Lỗi nghiệp vụ trả `{code, message}` đã dịch → ApiError.
 * Refresh cookie đi kèm nhờ `credentials: "include"` (cookie Path=/auth, SameSite=Lax).
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

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
  token?: string | null;
  locale?: string;
  query?: Record<string, string>;
};

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.locale) headers["Accept-Language"] = init.locale;
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
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

export type Identity = { provider: "password" | "google"; subject: string | null };

export type User = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  emailVerified: boolean;
  isGuest: boolean;
  locale: "vi" | "en";
  createdAt: string;
  identities: Identity[];
};

export type TokenOut = {
  accessToken: string;
  expiresIn: number;
  user: User;
  switched: boolean;
};
