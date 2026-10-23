/**
 * GameController: giao diện chung giữa màn chơi và "nguồn" ván đấu.
 * - LocalBotController (giai đoạn 0): người chơi vs bot ngay trong trình duyệt.
 * - NetworkController (giai đoạn 1): phòng đấu qua WebSocket, cùng giao diện này.
 */
import { botReply, type EmoteId, type Interaction } from "./interactions";
import { chooseMove } from "./bot";
import { createGameForMap, DEFAULT_MAP_ID, resolveMapId } from "./maps";
import { applyMove, winner, type GameState, type Player } from "./rules";
import type { Loadout } from "./skins/skins";
import type { RankOut, RankedResult } from "./ws-types";

export type EndReason = "complete" | "resign" | "afk" | "abandon";

export interface MoveInfo {
  edge: number;
  by: Player;
  captured: number[];
}

/** Các cạnh một người vẽ trong lượt gần nhất (một lượt = các nước liên tiếp của cùng người). */
export interface TurnMark {
  by: Player;
  edges: number[];
}

/** Cập nhật lượt gần nhất sau khi `by` vẽ `edge`. */
export function nextLastTurn(prev: TurnMark | null, by: Player, edge: number): TurnMark {
  return prev?.by === by ? { by, edges: [...prev.edges, edge] } : { by, edges: [edge] };
}

export interface GameResult {
  winner: Player | null;
  reason: EndReason;
  /** Trận xếp hạng: điểm hạng/thưởng theo ghế (docs/07); null nếu server không chốt được. */
  ranked?: RankedResult | null;
}

/** Ảnh chụp bất biến của ván đấu — mỗi thay đổi tạo object mới (hợp với useSyncExternalStore). */
export interface GameSession {
  /** Id map đã chốt (không bao giờ là "random"). */
  mapId: string;
  state: GameState;
  human: Player;
  bot: Player;
  lastMove: MoveInfo | null;
  lastTurn: TurnMark | null;
  /** Đánh dấu các cạnh đối thủ vừa vẽ (luật phòng riêng / cài đặt chơi với máy). */
  showLastMove: boolean;
  /** Số ô người đang có lượt đã ăn liên tiếp trong lượt này (cho "COMBO ×n"). */
  combo: number;
  thinking: boolean;
  result: GameResult | null;
  /** Chỉ có ở ván online (NetworkController). */
  online?: OnlineInfo;
}

export interface OnlineInfo {
  roomId: string;
  mode: "casual" | "ranked" | "private";
  status: "connecting" | "waiting" | "playing" | "over";
  /** Tên theo ghế 0/1 (null khi ghế trống). */
  names: [string | null, string | null];
  avatars: [string | null, string | null];
  /** Hạng hiển thị lúc vào trận (chỉ xếp hạng; null = đang phân hạng / không có). */
  ranks: [RankOut | null, RankOut | null];
  /** Ghế là máy (ghép bot khi chờ lâu, docs/07). */
  bots: [boolean, boolean];
  /** Skin bút / ô mỗi ghế đang trang bị (room_state.loadouts); null = mặc định. */
  loadouts: [Partial<Loadout> | null, Partial<Loadout> | null];
  turnSeconds: number | null;
  /** Hạn lượt hiện tại, epoch ms theo giờ server. */
  deadline: number | null;
  opponentOnline: boolean;
  /** Đối thủ đang rớt và server đã bắt đầu ân hạn: hạn nối lại (epoch ms server); hết → mình thắng. */
  graceUntil: number | null;
  /** Nước đi của mình đang chờ server xác nhận (animate lạc quan). */
  pendingEdge: number | null;
}

export interface GameController {
  getSession(): GameSession;
  subscribe(listener: () => void): () => void;
  /** Biểu cảm nhanh (docs/08 — Đồ ném). Trả false nếu không gửi được (ván xong, chưa vào ghế…). */
  emote(id: EmoteId): boolean;
  /** Ném đồ (skin loại throw mình có) vào đối thủ. */
  throwItem(id: string): boolean;
  /** Nhận tương tác của cả hai ghế (lớp phủ InteractionLayer vẽ). */
  subscribeInteractions(cb: (e: Interaction) => void): () => void;
  /** Nước đi của người chơi. Trả false nếu không hợp lệ / không phải lượt. */
  play(edge: number): boolean;
  resign(): void;
  newGame(opts?: Partial<NewGameOptions>): void;
  destroy(): void;
}

export interface NewGameOptions {
  /** Id map trong bể hoặc "random" (bốc lại mỗi ván mới). */
  mapId: string;
  /** Người chơi đi trước? */
  humanFirst: boolean;
}

export interface LocalBotOptions extends NewGameOptions {
  strength: number;
  showLastMove: boolean;
  /** Độ trễ "suy nghĩ" của bot [min, max] ms. */
  delayMs: [number, number];
  random: () => number;
}

const DEFAULTS: LocalBotOptions = {
  mapId: DEFAULT_MAP_ID,
  humanFirst: true,
  showLastMove: true,
  strength: 0.7,
  delayMs: [450, 900],
  random: Math.random,
};

export class LocalBotController implements GameController {
  private opts: LocalBotOptions;
  private session: GameSession;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private interactionListeners = new Set<(e: Interaction) => void>();
  private replyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: Partial<LocalBotOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.session = this.freshSession();
    this.scheduleBot();
  }

  private freshSession(): GameSession {
    const human: Player = this.opts.humanFirst ? 0 : 1;
    const mapId = resolveMapId(this.opts.mapId, this.opts.random);
    return {
      mapId,
      state: createGameForMap(mapId),
      human,
      bot: human === 0 ? 1 : 0,
      lastMove: null,
      lastTurn: null,
      showLastMove: this.opts.showLastMove,
      combo: 0,
      thinking: false,
      result: null,
    };
  }

  getSession(): GameSession {
    return this.session;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(next: Partial<GameSession>) {
    this.session = { ...this.session, ...next };
    for (const l of this.listeners) l();
  }

  play(edge: number): boolean {
    const s = this.session;
    if (s.result || s.thinking || s.state.turn !== s.human) return false;
    const applied = this.applyFor(s.human, edge);
    if (applied) this.scheduleBot();
    return applied;
  }

  private applyFor(player: Player, edge: number): boolean {
    const s = this.session;
    const res = applyMove(s.state, player, edge);
    if (!res.ok) return false;
    const captured = res.captured;
    const sameTurnStreak = s.lastMove?.by === player && s.lastMove.captured.length > 0;
    const combo = captured.length > 0 ? (sameTurnStreak ? s.combo : 0) + captured.length : 0;
    const result: GameResult | null = res.state.finished
      ? { winner: winner(res.state), reason: "complete" }
      : null;
    this.emit({
      state: res.state,
      lastMove: { edge, by: player, captured },
      lastTurn: nextLastTurn(s.lastTurn, player, edge),
      combo,
      result,
      thinking: false,
    });
    return true;
  }

  private scheduleBot() {
    const s = this.session;
    if (this.destroyed || s.result || s.state.turn !== s.bot) return;
    const [min, max] = this.opts.delayMs;
    const delay = min + this.opts.random() * Math.max(0, max - min);
    this.emit({ thinking: true });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.destroyed || this.session.result) return;
      const edge = chooseMove(this.session.state, {
        strength: this.opts.strength,
        random: this.opts.random,
      });
      this.applyFor(this.session.bot, edge);
      // Ăn ô thì bot đi tiếp (có độ trễ riêng cho từng nét).
      this.scheduleBot();
    }, delay);
  }

  resign(): void {
    if (this.session.result) return;
    this.clearTimer();
    this.emit({
      result: { winner: this.session.bot, reason: "resign" },
      thinking: false,
    });
  }

  newGame(opts: Partial<NewGameOptions> = {}): void {
    this.clearTimer();
    this.opts = { ...this.opts, ...opts };
    this.session = this.freshSession();
    for (const l of this.listeners) l();
    this.scheduleBot();
  }

  // ---------- Tương tác (docs/08 — Đồ ném): client-side, máy đáp lại bằng biểu cảm ----------

  emote(id: EmoteId): boolean {
    if (this.session.result) return false;
    this.emitInteraction({ kind: "emote", by: this.session.human, id });
    return true;
  }

  throwItem(id: string): boolean {
    if (this.session.result) return false;
    this.emitInteraction({ kind: "throw", by: this.session.human, id });
    return true;
  }

  subscribeInteractions(cb: (e: Interaction) => void): () => void {
    this.interactionListeners.add(cb);
    return () => this.interactionListeners.delete(cb);
  }

  private emitInteraction(e: Interaction) {
    for (const l of this.interactionListeners) l(e);
    if (e.by !== this.session.human) return;
    const reply = botReply(e, this.opts.random);
    if (this.replyTimer) clearTimeout(this.replyTimer);
    if (!reply) return;
    this.replyTimer = setTimeout(
      () => {
        this.replyTimer = null;
        if (this.destroyed || this.session.result) return;
        for (const l of this.interactionListeners)
          l({ kind: "emote", by: this.session.bot, id: reply });
      },
      800 + this.opts.random() * 600,
    );
  }

  /** Map người chơi đã chọn (có thể là "random"); map đang chơi nằm ở session.mapId. */
  get mapChoice(): string {
    return this.opts.mapId;
  }

  setStrength(strength: number) {
    this.opts.strength = Math.min(1, Math.max(0, strength));
  }

  /** Bật/tắt đánh dấu nước bot vừa đi — đổi ngay, không cần ván mới. */
  setShowLastMove(on: boolean) {
    this.opts.showLastMove = on;
    if (this.session.showLastMove !== on) this.emit({ showLastMove: on });
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.replyTimer) clearTimeout(this.replyTimer);
    this.replyTimer = null;
  }

  /** Tạm dừng bot (khi component unmount tạm thời, ví dụ StrictMode ở dev). */
  pause(): void {
    this.destroyed = true;
    this.clearTimer();
    if (this.session.thinking) this.emit({ thinking: false });
  }

  /** Chạy lại sau pause(); nếu đến lượt bot thì bot đi tiếp. */
  resume(): void {
    this.destroyed = false;
    this.scheduleBot();
  }

  destroy(): void {
    this.pause();
    this.listeners.clear();
    this.interactionListeners.clear();
  }
}
