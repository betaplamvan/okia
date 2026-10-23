import { create } from "zustand";
import type { ChatMessageOut } from "@/game/ws-types";
import { api } from "@/lib/api";
import { useConnection, wsClient } from "@/net/ws-client";
import { useAuth } from "@/stores/auth";

/**
 * Chat tổng (docs/15). Bong bóng góc phải hỏi `GET /chat/meta` định kỳ (số online + id tin cuối →
 * đếm tin chưa đọc so với id đã xem lưu ở localStorage). Mở khung chat: tải 50 tin gần nhất, nối
 * WS và `chat_watch` để nhận `chat_msg` trực tiếp; đóng thì `chat_unwatch` (WS vẫn giữ).
 */

const SEEN_KEY = "okia-chat-seen";
/** Giữ tối đa bấy nhiêu tin trong bộ nhớ (cắt bớt tin cũ khi chat mở lâu). */
const MAX_KEEP = 300;

type Page = { items: ChatMessageOut[]; hasMore: boolean };
type Meta = { online: number; lastId: number };

type ChatState = {
  open: boolean;
  expanded: boolean;
  messages: ChatMessageOut[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: boolean;
  online: number;
  lastId: number;
  /** Id tin cuối người này đã xem; null = chưa biết (lần đầu → coi như đã xem hết). */
  seenId: number | null;
  replyTo: ChatMessageOut | null;
  setOpen(open: boolean): void;
  toggleExpanded(): void;
  setReply(msg: ChatMessageOut | null): void;
  refreshMeta(): Promise<void>;
  loadOlder(): Promise<void>;
  /** Gửi tin; ném ApiError (đã dịch) khi server từ chối. */
  send(body: string): Promise<void>;
};

function readSeen(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v ? Number(v) || 0 : null;
  } catch {
    return null;
  }
}

function writeSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // Không có storage: chỉ mất đếm tin chưa đọc giữa các lần mở trang.
  }
}

/** Gộp tin theo id (REST và WS có thể trả trùng), giữ thứ tự tăng dần. */
function merge(a: ChatMessageOut[], b: ChatMessageOut[]): ChatMessageOut[] {
  const byId = new Map<number, ChatMessageOut>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

function authedOrPublic<T>(path: string, init: Parameters<typeof api>[1] = {}): Promise<T> {
  const auth = useAuth.getState();
  return auth.user ? auth.authed<T>(path, init) : api<T>(path, { ...init, locale: auth.locale });
}

export const useChat = create<ChatState>()((set, get) => ({
  open: false,
  expanded: false,
  messages: [],
  hasMore: false,
  loading: false,
  loaded: false,
  error: false,
  online: 0,
  lastId: 0,
  seenId: null,
  replyTo: null,

  setOpen(open) {
    if (open === get().open) return;
    set({ open });
    if (!open) {
      wsClient.send({ t: "chat_unwatch" });
      return;
    }
    markSeen();
    void wsClient.connect().then(() => wsClient.send({ t: "chat_watch" }));
    if (!get().loaded) void loadLatest();
  },

  toggleExpanded() {
    set({ expanded: !get().expanded });
  },

  setReply(replyTo) {
    set({ replyTo });
  },

  async refreshMeta() {
    try {
      const meta = await authedOrPublic<Meta>("/chat/meta");
      let seenId = get().seenId ?? readSeen();
      if (seenId === null) {
        // Lần đầu vào trang: không báo hàng trăm "tin chưa đọc" của người khác.
        seenId = meta.lastId;
        writeSeen(seenId);
      }
      set({ online: meta.online, lastId: Math.max(get().lastId, meta.lastId), seenId });
      if (get().open) markSeen();
    } catch {
      // Mạng lỗi: lần sau hỏi lại.
    }
  },

  async loadOlder() {
    const { messages, loading, hasMore } = get();
    if (loading || !hasMore || messages.length === 0) return;
    set({ loading: true });
    try {
      const page = await api<Page>("/chat/messages", {
        query: { before: String(messages[0].id) },
      });
      set({ messages: merge(page.items, get().messages), hasMore: page.hasMore });
    } catch {
      set({ error: true });
    } finally {
      set({ loading: false });
    }
  },

  async send(body) {
    const replyTo = get().replyTo?.id ?? null;
    const msg = await useAuth
      .getState()
      .authed<ChatMessageOut>("/chat/messages", { method: "POST", body: { body, replyTo } });
    set({ replyTo: null });
    receive(msg);
  },
}));

async function loadLatest() {
  useChat.setState({ loading: true, error: false });
  try {
    const page = await api<Page>("/chat/messages");
    const s = useChat.getState();
    useChat.setState({
      messages: merge(page.items, s.messages),
      hasMore: page.hasMore,
      loaded: true,
      lastId: Math.max(s.lastId, page.items.at(-1)?.id ?? 0),
    });
    markSeen();
  } catch {
    useChat.setState({ error: true });
  } finally {
    useChat.setState({ loading: false });
  }
}

function markSeen() {
  const { lastId, seenId } = useChat.getState();
  if (seenId === null || lastId > seenId) {
    useChat.setState({ seenId: lastId });
    writeSeen(lastId);
  }
}

function receive(msg: ChatMessageOut) {
  const s = useChat.getState();
  const lastId = Math.max(s.lastId, msg.id);
  if (!s.loaded) {
    useChat.setState({ lastId });
    return;
  }
  const messages = merge(s.messages, [msg]);
  useChat.setState({
    messages: messages.length > MAX_KEEP ? messages.slice(-MAX_KEEP) : messages,
    hasMore: s.hasMore || messages.length > MAX_KEEP,
    lastId,
  });
  if (s.open) markSeen();
}

// Tin mới qua WS (chỉ đến khi đã chat_watch).
wsClient.subscribe((msg) => {
  if (msg.t === "chat_msg") receive(msg.message);
});

// Nối lại WS trong lúc khung chat đang mở → đăng ký lại và bù tin lỡ trong lúc mất kết nối.
useConnection.subscribe((s, prev) => {
  if (s.status === "online" && prev.status !== "online" && useChat.getState().open) {
    wsClient.send({ t: "chat_watch" });
    if (useChat.getState().loaded) void loadLatest();
  }
});
