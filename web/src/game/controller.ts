/**
 * GameController: giao diện chung giữa màn chơi và "nguồn" ván đấu.
 * - LocalBotController (giai đoạn 0): người chơi vs bot ngay trong trình duyệt.
 * - NetworkController (giai đoạn 1): phòng đấu qua WebSocket, cùng giao diện này.
 */
import { chooseMove } from "./bot";
import { applyMove, createGame, winner, type GameState, type Player } from "./rules";

export type EndReason = "complete" | "resign" | "afk" | "abandon";

export interface MoveInfo {
  edge: number;
  by: Player;
  captured: number[];
}

export interface GameResult {
  winner: Player | null;
  reason: EndReason;
}

/** Ảnh chụp bất biến của ván đấu — mỗi thay đổi tạo object mới (hợp với useSyncExternalStore). */
export interface GameSession {
  state: GameState;
  human: Player;
  bot: Player;
  lastMove: MoveInfo | null;
  /** Số ô người đang có lượt đã ăn liên tiếp trong lượt này (cho "COMBO ×n"). */
  combo: number;
  thinking: boolean;
  result: GameResult | null;
  /** Chỉ có ở ván online (NetworkController). */
  online?: OnlineInfo;
}

export interface OnlineInfo {
  roomId: string;
  status: "connecting" | "waiting" | "playing" | "over";
  /** Tên theo ghế 0/1 (null khi ghế trống). */
  names: [string | null, string | null];
  turnSeconds: number | null;
  /** Hạn lượt hiện tại, epoch ms theo giờ server. */
  deadline: number | null;
  opponentOnline: boolean;
  /** Nước đi của mình đang chờ server xác nhận (animate lạc quan). */
  pendingEdge: number | null;
}

export interface GameController {
  getSession(): GameSession;
  subscribe(listener: () => void): () => void;
  /** Nước đi của người chơi. Trả false nếu không hợp lệ / không phải lượt. */
  play(edge: number): boolean;
  resign(): void;
  newGame(opts?: Partial<NewGameOptions>): void;
  destroy(): void;
}

export interface NewGameOptions {
  rows: number;
  cols: number;
  /** Người chơi đi trước? */
  humanFirst: boolean;
}

export interface LocalBotOptions extends NewGameOptions {
  strength: number;
  /** Độ trễ "suy nghĩ" của bot [min, max] ms. */
  delayMs: [number, number];
  random: () => number;
}

const DEFAULTS: LocalBotOptions = {
  rows: 5,
  cols: 5,
  humanFirst: true,
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

  constructor(opts: Partial<LocalBotOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.session = this.freshSession();
    this.scheduleBot();
  }

  private freshSession(): GameSession {
    const human: Player = this.opts.humanFirst ? 0 : 1;
    return {
      state: createGame(this.opts.rows, this.opts.cols),
      human,
      bot: human === 0 ? 1 : 0,
      lastMove: null,
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

  setStrength(strength: number) {
    this.opts.strength = Math.min(1, Math.max(0, strength));
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
  }
}
