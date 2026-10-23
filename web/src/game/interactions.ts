/**
 * Tương tác trong trận (docs/08 — Đồ ném, docs/04): biểu cảm nhanh (danh sách cố định, bản sao của
 * api/app/ws/messages.py EMOTES) và ném đồ (skin loại `throw` mình sở hữu). Chỉ hình + tiếng, không
 * ảnh hưởng ván.
 */
import type { Player } from "./rules";

export const EMOTES = ["hi", "gg", "lol", "wow", "cry", "angry", "think", "fire"] as const;
export type EmoteId = (typeof EMOTES)[number];
export const EMOTE_EMOJI: Record<EmoteId, string> = {
  hi: "👋",
  gg: "🤝",
  lol: "😂",
  wow: "😮",
  cry: "😭",
  angry: "😤",
  think: "🤔",
  fire: "🔥",
};

export function isEmoteId(id: string): id is EmoteId {
  return (EMOTES as readonly string[]).includes(id);
}

/** Một tương tác đã xảy ra (của mình hoặc đối thủ), theo ghế. */
export type Interaction =
  { kind: "emote"; by: Player; id: EmoteId } | { kind: "throw"; by: Player; id: string };

/** Nơi phát tương tác cho lớp phủ: GameController hoặc hộp thử trong Shop. */
export interface InteractionSource {
  subscribeInteractions(cb: (e: Interaction) => void): () => void;
}

/** Giãn cách tối thiểu giữa hai lần gửi (khớp server: 1 tin / 2 giây). */
export const INTERACT_COOLDOWN_MS = 2000;

/** Máy đáp lại tương tác của người (chơi với máy, client-side): sau ~0,8 giây, có xác suất. */
export function botReply(to: Interaction, random: () => number = Math.random): EmoteId | null {
  if (to.kind === "throw") {
    const pool: EmoteId[] = ["cry", "angry", "wow", "lol"];
    return pool[Math.floor(random() * pool.length)];
  }
  if (random() < 0.4) return null;
  const pool: EmoteId[] =
    to.id === "hi" ? ["hi"] : to.id === "gg" ? ["gg", "hi"] : ["lol", "wow", "think", "fire"];
  return pool[Math.floor(random() * pool.length)];
}
