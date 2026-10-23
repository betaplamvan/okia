/**
 * WebSocket client (docs/04, P1-17): một kết nối cho cả tab, tự kết nối lại với backoff,
 * tự làm mới access token trước khi nối, ping mỗi 20 giây, store trạng thái kết nối (zustand).
 *
 * Độ bền (2026-10-24, docs/04 — Kết nối lại): không mở socket thứ hai khi đang mở dở; tab hiện
 * lại / có mạng → nối lại NGAY (không chờ backoff); ping chờ pong 8 giây — socket treo (mạng di
 * động, máy ngủ) tự đóng và nối lại; refresh token lỗi mạng → thử lại, không rơi xuống khách.
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import type { ClientMsg, ServerMsg } from "@/game/ws-types";
import { WS_URL } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export type ConnectionStatus = "idle" | "connecting" | "online" | "offline";

type ConnectionState = {
  status: ConnectionStatus;
  /** serverTime − Date.now() tại lúc nhận welcome; cộng vào Date.now() để so với deadline. */
  clockOffset: number;
  activeRoomId: string | null;
  userId: string | null;
};

export const useConnection = create<ConnectionState>()(() => ({
  status: "idle",
  clockOffset: 0,
  activeRoomId: null,
  userId: null,
}));

type Listener = (msg: ServerMsg) => void;

// Phòng đang dở (docs/04 — Kết nối lại): server chỉ gửi `welcome.activeRoomId` lúc kết nối, mà trang
// khác có thể chưa nối WS → lưu thêm vào sessionStorage để ô "Bạn đang dở một trận" hiện ngay sau
// khi tải lại; `welcome` là nguồn chuẩn (null → xoá bản lưu).
const ACTIVE_ROOM_KEY = "okia-active-room";
const ACTIVE_ROOM_EVENT = "okia-active-room";

export function readActiveRoom(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_ROOM_KEY);
  } catch {
    return null;
  }
}

export function setActiveRoom(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(ACTIVE_ROOM_KEY, id);
    else sessionStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    // Không có storage: chỉ còn giá trị trong store.
  }
  useConnection.setState({ activeRoomId: id });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVE_ROOM_EVENT));
}

function subscribeActiveRoom(cb: () => void): () => void {
  window.addEventListener(ACTIVE_ROOM_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ACTIVE_ROOM_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Phòng đang dở theo bản lưu (hydrate = null, rồi cập nhật ở client). */
export function useActiveRoom(): string | null {
  return useSyncExternalStore(subscribeActiveRoom, readActiveRoom, () => null);
}

const PING_MS = 20_000;
/** Gửi ping mà quá chừng này không có tin nào về → coi socket đã chết. */
const PONG_TIMEOUT_MS = 8_000;
const MAX_BACKOFF_MS = 30_000;
const CLOSE_UNAUTHORIZED = 4401;
/** Tài khoản đăng nhập nơi khác (docs/13). Refresh: cùng trình duyệt thì cookie mới vẫn dùng được,
 *  khác nơi thì store về khách và báo người dùng. */
const CLOSE_SESSION_REPLACED = 4409;

export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private wanted = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeBound = false;
  private opening = false;
  private waiters: Array<() => void> = [];
  /** Server vừa từ chối token (4401/4409) → lần nối sau phải refresh dù token chưa hết hạn. */
  private stale = false;

  /** Bật kết nối (idempotent). Trả promise xong khi đã online lần này. */
  connect(): Promise<void> {
    this.wanted = true;
    this.bindWake();
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    const p = new Promise<void>((resolve) => this.waiters.push(resolve));
    // Đang mở dở (CONNECTING) → chỉ chờ, không mở thêm socket thứ hai.
    if (!(this.ws && this.ws.readyState === WebSocket.CONNECTING)) void this.open();
    return p;
  }

  /** Tab hiện lại / có mạng / focus: đang offline thì nối lại ngay; đang online thì ping để kiểm
   *  tra socket còn sống (máy ngủ dậy socket thường đã chết mà trình duyệt chưa biết). */
  private bindWake(): void {
    if (this.wakeBound || typeof window === "undefined") return;
    this.wakeBound = true;
    const wake = () => {
      if (!this.wanted) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (this.online) {
        this.ping();
        return;
      }
      if (this.ws?.readyState === WebSocket.CONNECTING) return;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.attempt = 0;
      void this.open();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
  }

  disconnect(): void {
    this.wanted = false;
    this.clearTimers();
    this.ws?.close(1000, "bye");
    this.ws = null;
    useConnection.setState({ status: "idle", activeRoomId: null });
  }

  get online(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg): boolean {
    if (!this.online) return false;
    this.ws!.send(JSON.stringify(msg));
    return true;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private async open(): Promise<void> {
    if (this.opening || !this.wanted) return;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.opening = true;
    useConnection.setState({ status: "connecting" });
    try {
      const auth = useAuth.getState();
      await auth.boot(auth.locale);
      let s = useAuth.getState();
      if (this.stale || !s.accessToken || Date.now() > s.expiresAt - 30_000) {
        // refresh(): 401 → null (phiên hết) → khách; lỗi mạng / 5xx → ném ra → thử lại sau backoff
        // (trước đây mọi lỗi đều rơi xuống khách → tài khoản thật vào phòng bị ROOM_FULL).
        const user = await s.refresh();
        if (!user) await s.guest();
        s = useAuth.getState();
        this.stale = false;
      }
      const token = s.accessToken;
      if (!token) throw new Error("no token");
      const url = `${WS_URL}?token=${encodeURIComponent(token)}&lang=${s.locale}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.attempt = 0;
        useConnection.setState({ status: "online" });
        this.startPing();
        const w = this.waiters;
        this.waiters = [];
        w.forEach((r) => r());
      };
      ws.onmessage = (ev) => {
        // Bất kỳ tin nào về cũng chứng tỏ socket sống.
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMsg;
        } catch {
          return;
        }
        if (msg.t === "welcome") {
          useConnection.setState({
            clockOffset: msg.serverTime - Date.now(),
            userId: msg.userId,
          });
          setActiveRoom(msg.activeRoomId ?? null);
        }
        for (const l of this.listeners) l(msg);
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.clearTimers();
        if (!this.wanted) return;
        useConnection.setState({ status: "offline" });
        // 4401 / 4409: token không còn dùng được → open() refresh trước khi nối lại.
        const rejected = ev.code === CLOSE_UNAUTHORIZED || ev.code === CLOSE_SESSION_REPLACED;
        if (rejected) this.stale = true;
        const delay = rejected ? 300 : this.backoff();
        this.reconnectTimer = setTimeout(() => void this.open(), delay);
      };
      ws.onerror = () => {
        // onclose sẽ theo sau; không làm gì thêm.
      };
    } catch {
      useConnection.setState({ status: "offline" });
      if (this.wanted) this.reconnectTimer = setTimeout(() => void this.open(), this.backoff());
    } finally {
      this.opening = false;
    }
  }

  private backoff(): number {
    const d = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt) * (0.8 + Math.random() * 0.4);
    this.attempt = Math.min(this.attempt + 1, 6);
    return d;
  }

  private startPing(): void {
    this.clearTimers();
    this.pingTimer = setInterval(() => this.ping(), PING_MS);
  }

  /** Ping + chờ pong: không có tin nào về trong PONG_TIMEOUT_MS → đóng để nối lại ngay. */
  private ping(): void {
    if (!this.send({ t: "ping" })) return;
    if (this.pongTimer) return;
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      this.attempt = 0;
      ws.close(4000, "pong timeout");
    }, PONG_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
  }
}

/** Singleton dùng chung toàn app (client). */
export const wsClient = new WsClient();

/** Giờ hiện tại theo đồng hồ server. */
export function serverNow(): number {
  return Date.now() + useConnection.getState().clockOffset;
}
