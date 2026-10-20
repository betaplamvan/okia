/**
 * WebSocket client (docs/04, P1-17): một kết nối cho cả tab, tự kết nối lại với backoff,
 * tự làm mới access token trước khi nối, ping mỗi 20 giây, store trạng thái kết nối (zustand).
 */
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

const PING_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;
const CLOSE_UNAUTHORIZED = 4401;

export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private wanted = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private opening = false;
  private waiters: Array<() => void> = [];

  /** Bật kết nối (idempotent). Trả promise xong khi đã online lần này. */
  connect(): Promise<void> {
    this.wanted = true;
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    const p = new Promise<void>((resolve) => this.waiters.push(resolve));
    void this.open();
    return p;
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
    this.opening = true;
    useConnection.setState({ status: "connecting" });
    try {
      const auth = useAuth.getState();
      await auth.boot(auth.locale);
      let s = useAuth.getState();
      if (!s.accessToken || Date.now() > s.expiresAt - 30_000) {
        const user = await s.refresh().catch(() => null);
        if (!user) await s.guest();
        s = useAuth.getState();
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
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMsg;
        } catch {
          return;
        }
        if (msg.t === "welcome") {
          useConnection.setState({
            clockOffset: msg.serverTime - Date.now(),
            activeRoomId: msg.activeRoomId ?? null,
            userId: msg.userId,
          });
        }
        for (const l of this.listeners) l(msg);
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.clearTimers();
        if (!this.wanted) return;
        useConnection.setState({ status: "offline" });
        // 4401: token hết hạn → open() sẽ refresh trước khi nối lại.
        const delay = ev.code === CLOSE_UNAUTHORIZED ? 300 : this.backoff();
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
    this.pingTimer = setInterval(() => this.send({ t: "ping" }), PING_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }
}

/** Singleton dùng chung toàn app (client). */
export const wsClient = new WsClient();

/** Giờ hiện tại theo đồng hồ server. */
export function serverNow(): number {
  return Date.now() + useConnection.getState().clockOffset;
}
