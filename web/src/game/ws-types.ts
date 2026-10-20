/* eslint-disable */
// Sinh tự động từ shared/ws-schema.json — KHÔNG sửa tay. Chạy `pnpm gen:ws`.

export interface OkiaWs {
  client: Queue | QueueCancel | RoomCreate | RoomJoin | RoomLeave | Move | Resign | Emote | Ping;
  server:
    | Welcome
    | Queued
    | Matched
    | RoomState
    | Moved
    | GameOver
    | OpponentStatus
    | EmoteOut
    | BotSay
    | MatchReview
    | Error
    | Pong;
}
export interface Queue {
  t: "queue";
  mode: "casual" | "ranked";
  board?: string;
}
export interface QueueCancel {
  t: "queue_cancel";
}
export interface RoomCreate {
  t: "room_create";
  board?: string;
  turnSeconds?: (15 | 30 | 60) | null;
  showLastMove?: boolean;
}
export interface RoomJoin {
  t: "room_join";
  roomId: string;
}
/**
 * Rời phòng đang chờ (chưa có đối thủ) hoặc phòng đã kết thúc.
 */
export interface RoomLeave {
  t: "room_leave";
  roomId: string;
}
export interface Move {
  t: "move";
  roomId: string;
  edge: number;
  seq: number;
}
export interface Resign {
  t: "resign";
  roomId: string;
}
export interface Emote {
  t: "emote";
  roomId: string;
  id: string;
}
export interface Ping {
  t: "ping";
}
export interface Welcome {
  t: "welcome";
  userId: string;
  activeRoomId?: string | null;
  serverTime: number;
}
export interface Queued {
  t: "queued";
  mode: string;
  board: string;
  since: number;
}
export interface Matched {
  t: "matched";
  roomId: string;
}
export interface RoomState {
  t: "room_state";
  roomId: string;
  mode: "casual" | "ranked" | "private";
  board: string;
  turnSeconds: (15 | 30 | 60) | null;
  showLastMove?: boolean;
  status: "waiting" | "playing" | "over";
  hostId: string;
  players: PlayerOut[];
  state: GameStateOut;
  deadline?: number | null;
  result?: GameOver | null;
  loadouts?: {
    [k: string]: {
      [k: string]: string;
    };
  };
}
export interface PlayerOut {
  userId: string;
  name: string;
  seat: 0 | 1;
  isBot?: boolean;
  tier?: string | null;
  online?: boolean;
}
export interface GameStateOut {
  rows: number;
  cols: number;
  edges: number[];
  owners: number[];
  scores: number[];
  turn: 0 | 1;
  moveNo: number;
  finished: boolean;
}
export interface GameOver {
  t: "game_over";
  roomId: string;
  winner: (0 | 1) | null;
  scores: number[];
  reason: "complete" | "resign" | "afk" | "abandon";
  ratingDelta?: number[] | null;
  rewards?: {
    [k: string]: number;
  } | null;
}
export interface Moved {
  t: "moved";
  roomId: string;
  by: 0 | 1;
  edge: number;
  captured: number[];
  scores: number[];
  turn: 0 | 1;
  moveNo: number;
  deadline?: number | null;
  reason?: "player" | "timeout";
}
export interface OpponentStatus {
  t: "opponent_status";
  roomId: string;
  online: boolean;
}
export interface EmoteOut {
  t: "emote";
  roomId: string;
  by: 0 | 1;
  id: string;
}
export interface BotSay {
  t: "bot_say";
  roomId: string;
  text: string;
  event: string;
}
export interface MatchReview {
  t: "match_review";
  matchId: string;
  text: string;
  keyMove?: number | null;
}
export interface Error {
  t: "error";
  code: string;
  message: string;
  ref?: string | null;
}
export interface Pong {
  t: "pong";
}

// Union theo chiều gửi (docs/04).
export type ClientMsg = OkiaWs["client"];
export type ServerMsg = OkiaWs["server"];
