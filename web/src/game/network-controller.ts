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
import { createGameForMap, DEFAULT_MAP_ID } from "./maps";
import { applyMove, type GameState, type Player } from "./rules";
import type { GameOver, GameStateOut, RankOut, RoomState, ServerMsg } from "./ws-types";
import { useConnection, type WsClient } from "@/net/ws-client";

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
        turnSeconds: null,
        deadline: null,
        opponentOnline: false,
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
        const res = applyMove(this.serverState, by, m.edge);
        if (!res.ok) {
          // Lệch với server (bỏ lỡ tin nhắn?) → xin ảnh chụp mới.
          this.join();
          return;
        }
        this.serverState = res.state;
        const prev = this.session;
        const sameTurnStreak = prev.lastMove?.by === by && prev.lastMove.captured.length > 0;
        const combo =
          res.captured.length > 0 ? (sameTurnStreak ? prev.combo : 0) + res.captured.length : 0;
        const wasPending = prev.online?.pendingEdge === m.edge && by === this.mySeat;
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
      case "opponent_status":
        if (m.roomId === this.roomId) this.emit({}, { opponentOnline: m.online });
        return;
      case "error":
        if (m.ref === "move") {
          // Hoàn tác nước lạc quan.
          this.emit(
            { state: this.serverState, lastMove: null, lastTurn: null },
            { pendingEdge: null },
          );
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
    let opponentOnline = false;
    for (const p of rs.players) {
      names[p.seat] = p.name;
      avatars[p.seat] = p.avatarUrl ?? null;
      ranks[p.seat] = p.rank ?? null;
      if (p.userId !== me) opponentOnline = p.online ?? false;
    }
    this.serverState = fromServer(rs.state);
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
        turnSeconds: rs.turnSeconds ?? null,
        deadline: rs.deadline ?? null,
        opponentOnline,
        pendingEdge: null,
      },
    );
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
    if (useConnection.getState().activeRoomId === this.roomId)
      useConnection.setState({ activeRoomId: null });
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.listeners.clear();
  }
}
