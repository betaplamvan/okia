/**
 * Tìm trận xếp hạng toàn cục (docs/07, 2026-10-22): trạng thái sống ngoài trang /ranked — rời
 * trang vẫn tìm (cửa sổ thu nhỏ ở mọi trang, MatchmakingHost), ghép được (người hay máy) thì hộp
 * chấp nhận bật lên ở bất kỳ đâu, chấp nhận → vào phòng. Lắng nghe WS một lần cho cả app.
 * Trạng thái lưu sessionStorage: tải lại trang / gõ địa chỉ vẫn đang tìm (server giữ chỗ trong hàng
 * chờ; nối lại WS → `welcome` → gửi `queue` lại, server trả `since` cũ).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ServerMsg } from "@/game/ws-types";
import { serverNow, wsClient } from "@/net/ws-client";
import { useAuth } from "@/stores/auth";

export type Search =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "searching"; since: number; waiting: number; online: number; widened: boolean }
  /** Đã ghép, chờ chấp nhận (docs/07 — Chấp nhận trận). `bot`: đối thủ là máy (đã nhận sẵn). */
  | {
      phase: "found";
      matchId: string;
      expiresAt: number;
      acceptSeconds: number;
      since: number;
      accepted: boolean;
      others: number;
      bot: boolean;
    };

/** Thông báo cho MatchmakingHost hiện toast (dịch ở component). */
export type Notice = {
  id: number;
  key: "cancelTimeout" | "cancelOther" | "inGame" | "loadError" | "serverError";
  message?: string;
};

type State = {
  search: Search;
  /** Phòng vừa được ghép — host điều hướng rồi xóa. */
  matchedRoom: string | null;
  notice: Notice | null;
  find(): Promise<void>;
  cancel(): void;
  accept(): void;
  decline(): void;
  clearMatched(): void;
};

export const isActive = (s: Search) => s.phase !== "idle";

let noticeId = 0;
const notify = (key: Notice["key"], message?: string): Notice => ({ id: ++noticeId, key, message });

export const useMatchmaking = create<State>()(
  persist(
    (set, get) => ({
      search: { phase: "idle" },
      matchedRoom: null,
      notice: null,

      async find() {
        if (isActive(get().search)) return;
        set({ search: { phase: "requesting" } });
        await wsClient.connect();
        if (!wsClient.send({ t: "queue", mode: "ranked" })) {
          set({ search: { phase: "idle" }, notice: notify("loadError") });
        }
      },

      // Hủy tìm: server bỏ khỏi hàng chờ; đang có trận chờ thì server coi như từ chối.
      cancel() {
        if (!isActive(get().search)) return;
        wsClient.send({ t: "queue_cancel" });
        set({ search: { phase: "idle" } });
      },

      accept() {
        const s = get().search;
        if (s.phase !== "found") return;
        wsClient.send({ t: "match_accept", matchId: s.matchId });
        set({ search: { ...s, accepted: true } });
      },

      decline() {
        const s = get().search;
        if (s.phase !== "found") return;
        wsClient.send({ t: "match_decline", matchId: s.matchId });
        set({ search: { phase: "idle" } });
      },

      clearMatched() {
        set({ matchedRoom: null });
      },
    }),
    {
      name: "okia-matchmaking",
      storage: createJSONStorage(() => sessionStorage),
      // Chỉ giữ trạng thái tìm; trận chờ (found) không khôi phục được sau tải lại → về searching
      // (server vẫn giữ trận chờ; hết giờ thì tự hủy, client nhận match_cancelled khi nối lại).
      partialize: (s) => ({
        search:
          s.search.phase === "found"
            ? { phase: "searching", since: s.search.since, waiting: 1, online: 1, widened: false }
            : s.search,
      }),
    },
  ),
);

function handle(m: ServerMsg) {
  const { search: cur } = useMatchmaking.getState();
  const set = useMatchmaking.setState;
  switch (m.t) {
    case "queued":
      // Chỉ khi đang tìm (tin `queued` của tab khác cùng tài khoản thì bỏ qua).
      if (isActive(cur))
        set({
          search: { phase: "searching", since: m.since, waiting: 1, online: 1, widened: false },
        });
      return;
    case "queue_status":
      if (cur.phase === "searching")
        set({
          search: { ...cur, waiting: m.waiting, online: m.online, widened: m.widened ?? false },
        });
      return;
    case "match_found":
      if (!isActive(cur)) return;
      set({
        search: {
          phase: "found",
          matchId: m.matchId,
          expiresAt: m.expiresAt,
          acceptSeconds: m.acceptSeconds,
          since: cur.phase === "searching" || cur.phase === "found" ? cur.since : serverNow(),
          accepted: false,
          others: 0,
          bot: m.bot ?? false,
        },
      });
      return;
    case "match_update":
      if (cur.phase === "found" && cur.matchId === m.matchId)
        set({ search: { ...cur, others: m.accepted - (cur.accepted ? 1 : 0) } });
      return;
    case "match_cancelled":
      if (!isActive(cur)) return;
      // Người kia từ chối / hết giờ → server đã trả ta về hàng chờ và gửi `queued` ngay sau.
      if (m.requeued) {
        set({ notice: notify(m.byMe ? "cancelTimeout" : "cancelOther") });
      } else {
        set({
          search: { phase: "idle" },
          notice: m.reason === "timeout" ? notify("cancelTimeout") : null,
        });
      }
      return;
    case "matched":
      set({ search: { phase: "idle" }, matchedRoom: m.roomId });
      return;
    case "welcome":
      // Nối lại giữa chừng: server đã bỏ ta khỏi hàng chờ khi rớt → vào lại.
      if (isActive(cur)) wsClient.send({ t: "queue", mode: "ranked" });
      return;
    case "error":
      if (m.ref !== "queue") return;
      set({ search: { phase: "idle" } });
      if (m.code === "GUEST_NOT_ALLOWED" || m.code === "EMAIL_NOT_VERIFIED") {
        useAuth.getState().openProfile("account");
      } else if (m.code === "ALREADY_IN_GAME") {
        set({ notice: notify("inGame") });
      } else {
        set({ notice: notify("serverError", m.message) });
      }
      return;
    default:
      return;
  }
}

if (typeof window !== "undefined") wsClient.subscribe(handle);
