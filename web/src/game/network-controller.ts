/**
 * NetworkController (docs/04, P1-18): ván online qua WebSocket, cùng giao diện GameController.
 * - Animate lạc quan: nước của mình áp dụng ngay ở client; server trả `moved` thì đồng bộ,
 *   trả `error` (ref = "move") thì hoàn tác về trạng thái server cuối cùng.
 * - `room_state` là ảnh chụp đầy đủ (vào phòng / kết nối lại).
 */
import {
  nextLastTurn,
  type GameController,
  type GameResult,
  type GameSession,
  type OnlineInfo,
} from "./controller";
import { type EmoteId, type Interaction, isEmoteId } from "./interactions";
import { createGameForMap, DEFAULT_MAP_ID } from "./maps";
import { applyMove, type GameState, type Player } from "./rules";
import type { GameOver, GameStateOut, RankOut, RoomState, ServerMsg } from "./ws-types";
import { setActiveRoom, useConnection, type WsClient } from "@/net/ws-client";

export type NetworkEvent =
  { type: "error"; code: string; message: string; ref?: string | null } | { type: "left" };

function fromServer(s: GameStateOut): GameState {
  return {
    rows: s.rows,
    cols: s.cols,
    edges: s.edges as GameState["edges"],
    owners: s.owners as GameState["owners"],
    scores: [s.scores[0], s.scores[1]],
    turn: s.turn,
    moveNo: s.moveNo,
    finished: s.finished,
  };
}

function resultOf(over: GameOver): GameResult {
  return { winner: over.winner ?? null, reason: over.reason, ranked: over.ranked ?? null };
}

export class NetworkController implements GameController {
  private session: GameSession;
  /** Trạng thái server xác nhận gần nhất (để hoàn tác). */
  private serverState: GameState;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;
  private mySeat: Player | null = null;
  private interactionListeners = new Set<(e: Interaction) => void>();
  /** Nước lạc quan chờ server quá lâu (socket treo) → hoàn tác + xin ảnh chụp. */
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ws: WsClient,
    private readonly roomId: string,
    private readonly onEvent: (e: NetworkEvent) => void = () => {},
  ) {
    this.serverState = createGameForMap(DEFAULT_MAP_ID);
    this.session = {
      mapId: DEFAULT_MAP_ID,
      state: this.serverState,
      human: 0,
      bot: 1,
      lastMove: null,
      lastTurn: null,
      showLastMove: true,
      combo: 0,
      thinking: false,
      result: null,
      online: {
        roomId,
        mode: "private",
        status: "connecting",
        names: [null, null],
        avatars: [null, null],
        ranks: [null, null],
        bots: [false, false],
        loadouts: [null, null],
        turnSeconds: null,
        deadline: null,
        opponentOnline: false,
        graceUntil: null,
        pendingEdge: null,
      },
    };
  }

  /** Kết nối (nếu chưa) và vào phòng; kết nối lại cũng tự `room_join`. */
  start(): void {
    // StrictMode (dev) gọi destroy() rồi start() lại trên cùng instance → mở lại.
    this.destroyed = false;
    this.unsubscribe?.();
    this.unsubscribe = this.ws.subscribe((m) => this.handle(m));
    void this.ws.connect().then(() => this.join());
  }

  private join(): void {
    if (this.destroyed) return;
    this.ws.send({ t: "room_join", roomId: this.roomId });
  }

  getSession(): GameSession {
    return this.session;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(next: Partial<GameSession>, online?: Partial<OnlineInfo>) {
    this.session = {
      ...this.session,
      ...next,
      online: { ...this.session.online!, ...online },
    };
    for (const l of this.listeners) l();
  }

  // ---------- Tin nhắn từ server ----------

  private handle(m: ServerMsg) {
    if (this.destroyed) return;
    switch (m.t) {
      case "welcome":
        // Kết nối lại → vào lại phòng để lấy ảnh chụp mới.
        this.join();
        return;
      case "room_state":
        if (m.roomId === this.roomId) this.applyRoomState(m);
        return;
      case "moved": {
        if (m.roomId !== this.roomId) return;
        const by = m.by as Player;
        // Bỏ lỡ tin `moved` (rớt mạng thoáng, nối lại đúng lúc) → số nước không liên tiếp → xin
        // ảnh chụp mới thay vì áp nước lên bàn đã lệch.
        if (m.moveNo !== this.serverState.moveNo + 1) {
          this.join();
          return;
        }
        const res = applyMove(this.serverState, by, m.edge);
        if (!res.ok) {
          this.join();
          return;
        }
        this.clearPending();
        this.serverState = res.state;
        const prev = this.session;
        const wasPending = prev.online?.pendingEdge === m.edge && by === this.mySeat;
        const sameTurnStreak = prev.lastMove?.by === by && prev.lastMove.captured.length > 0;
        // Nước của mình đã tính combo lúc bấm (lạc quan): server dội lại cùng nước thì GIỮ, không
        // cộng lần nữa (trước đây cộng đôi → combo nhảy 1 → 3 → 5, chữ ×2 / ×4 không bao giờ hiện).
        const combo = wasPending
          ? prev.combo
          : res.captured.length > 0
            ? (sameTurnStreak ? prev.combo : 0) + res.captured.length
            : 0;
        this.emit(
          {
            state: res.state,
            // Nước của mình đã animate lúc bấm → không animate lại (lastMove giữ nguyên edge).
            lastMove: { edge: m.edge, by, captured: res.captured },
            // Nước của mình đã được thêm lúc bấm (lạc quan) → không thêm lần nữa.
            lastTurn: wasPending ? prev.lastTurn : nextLastTurn(prev.lastTurn, by, m.edge),
            combo,
          },
          {
            deadline: m.deadline ?? null,
            pendingEdge: wasPending ? null : prev.online!.pendingEdge,
          },
        );
        return;
      }
      case "game_over":
        if (m.roomId !== this.roomId) return;
        this.clearActiveRoom();
        this.emit({ result: resultOf(m) }, { status: "over", deadline: null });
        return;
      case "opponent_status": {
        if (m.roomId !== this.roomId) return;
        // Gửi cho cả phòng — tin về chính mình (nối lại) thì bỏ qua.
        const me = useConnection.getState().userId;
        if (m.userId && me && m.userId === me) return;
        this.emit(
          {},
          { opponentOnline: m.online, graceUntil: m.online ? null : (m.graceUntil ?? null) },
        );
        return;
      }
      case "emote":
        // Server dội lại cho cả hai ghế (kể cả người gửi) → chỉ vẽ ở đây, không vẽ lúc bấm.
        if (m.roomId === this.roomId && isEmoteId(m.id))
          this.emitInteraction({ kind: "emote", by: m.by as Player, id: m.id });
        return;
      case "throw_out":
        if (m.roomId === this.roomId)
          this.emitInteraction({ kind: "throw", by: m.by as Player, id: m.id });
        return;
      case "error":
        // Phòng không còn / không vào được → xoá bản lưu để ô "đang dở trận" không trỏ vào phòng chết.
        if (m.ref === "room_join" && (m.code === "ROOM_NOT_FOUND" || m.code === "ROOM_FULL"))
          this.clearActiveRoom();
        if (m.ref === "move") {
          // Hoàn tác nước lạc quan.
          this.clearPending();
          this.emit(
            { state: this.serverState, lastMove: null, lastTurn: null },
            { pendingEdge: null },
          );
          // Trạng thái đã cũ (bỏ lỡ moved) → lấy ảnh chụp mới (docs/04).
          if (m.code === "STALE_SEQ") this.join();
        }
        this.onEvent({ type: "error", code: m.code, message: m.message, ref: m.ref });
        return;
      default:
        return;
    }
  }

  private applyRoomState(rs: RoomState) {
    const me = useConnection.getState().userId;
    const mine = rs.players.find((p) => p.userId === me);
    const seat = (mine?.seat ?? 0) as Player;
    this.mySeat = mine ? seat : null;
    const names: [string | null, string | null] = [null, null];
    const avatars: [string | null, string | null] = [null, null];
    const ranks: [RankOut | null, RankOut | null] = [null, null];
    const bots: [boolean, boolean] = [false, false];
    const loadouts: OnlineInfo["loadouts"] = [null, null];
    let opponentOnline = false;
    for (const p of rs.players) {
      names[p.seat] = p.name;
      avatars[p.seat] = p.avatarUrl ?? null;
      ranks[p.seat] = p.rank ?? null;
      bots[p.seat] = p.isBot ?? false;
      loadouts[p.seat] = rs.loadouts?.[p.userId] ?? null;
      if (p.userId !== me) opponentOnline = p.online ?? false;
    }
    this.serverState = fromServer(rs.state);
    this.clearPending();
    const oppSeat = mine ? 1 - seat : null;
    // Đang chơi → ghi nhớ phòng (welcome chỉ gửi activeRoomId lúc kết nối): rời sang trang khác
    // vẫn có ô "Bạn đang dở một trận — Vào lại" (MatchmakingHost); ván xong / rời phòng thì xoá.
    if (mine && rs.status === "playing") setActiveRoom(rs.roomId);
    else if (rs.status === "over") this.clearActiveRoom();
    this.emit(
      {
        mapId: rs.board,
        state: this.serverState,
        human: seat,
        bot: (1 - seat) as Player,
        lastMove: null,
        lastTurn: null,
        showLastMove: rs.showLastMove ?? true,
        combo: 0,
        result: rs.result ? resultOf(rs.result) : null,
      },
      {
        mode: rs.mode,
        status: rs.status,
        names,
        avatars,
        ranks,
        bots,
        loadouts,
        turnSeconds: rs.turnSeconds ?? null,
        deadline: rs.deadline ?? null,
        opponentOnline,
        graceUntil:
          !opponentOnline && rs.graceSeat != null && rs.graceSeat === oppSeat
            ? (rs.graceUntil ?? null)
            : null,
        pendingEdge: null,
      },
    );
  }

  private clearPending(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  // ---------- Hành động của người chơi ----------

  play(edge: number): boolean {
    const s = this.session;
    if (s.result || s.online?.status !== "playing" || this.mySeat === null) return false;
    if (s.online.pendingEdge !== null || s.state.turn !== this.mySeat) return false;
    const res = applyMove(s.state, this.mySeat, edge);
    if (!res.ok) return false;
    const seq = this.serverState.moveNo;
    if (!this.ws.send({ t: "move", roomId: this.roomId, edge, seq })) return false;
    // Quá 5 giây không có moved / error (socket treo) → hoàn tác và đồng bộ lại.
    this.clearPending();
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.destroyed || this.session.online?.pendingEdge !== edge) return;
      this.emit({ state: this.serverState, lastMove: null, lastTurn: null }, { pendingEdge: null });
      this.join();
    }, 5000);
    const sameTurnStreak = s.lastMove?.by === this.mySeat && s.lastMove.captured.length > 0;
    const combo =
      res.captured.length > 0 ? (sameTurnStreak ? s.combo : 0) + res.captured.length : 0;
    this.emit(
      {
        state: res.state,
        lastMove: { edge, by: this.mySeat, captured: res.captured },
        lastTurn: nextLastTurn(s.lastTurn, this.mySeat, edge),
        combo,
      },
      { pendingEdge: edge },
    );
    return true;
  }

  resign(): void {
    if (this.session.result) return;
    this.ws.send({ t: "resign", roomId: this.roomId });
  }

  // ---------- Tương tác (docs/08 — Đồ ném) ----------

  emote(id: EmoteId): boolean {
    if (!this.canInteract()) return false;
    return this.ws.send({ t: "emote", roomId: this.roomId, id });
  }

  throwItem(id: string): boolean {
    if (!this.canInteract()) return false;
    return this.ws.send({ t: "throw", roomId: this.roomId, id });
  }

  subscribeInteractions(cb: (e: Interaction) => void): () => void {
    this.interactionListeners.add(cb);
    return () => this.interactionListeners.delete(cb);
  }

  private canInteract(): boolean {
    const o = this.session.online;
    return !this.session.result && this.mySeat !== null && !!o && o.status !== "over";
  }

  private emitInteraction(e: Interaction) {
    for (const l of this.interactionListeners) l(e);
  }

  /** Online không có "ván mới" tại chỗ; màn hình sẽ điều hướng về sảnh. */
  newGame(): void {}

  leave(): void {
    this.ws.send({ t: "room_leave", roomId: this.roomId });
    this.clearActiveRoom();
    this.onEvent({ type: "left" });
  }

  /** welcome.activeRoomId chỉ được server gửi lúc kết nối; phòng xong/rời thì xóa, nếu không sảnh
   * (/room) sẽ tự đẩy người chơi về lại phòng cũ. */
  private clearActiveRoom(): void {
    if (useConnection.getState().activeRoomId === this.roomId) setActiveRoom(null);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearPending();
    this.unsubscribe?.();
    this.listeners.clear();
    this.interactionListeners.clear();
  }
}
