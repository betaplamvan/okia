// NetworkController (docs/04): combo trong ván online. Nước của mình được tính lạc quan lúc bấm;
// khi server dội lại `moved` cùng nước, combo phải GIỮ nguyên (trước đây cộng đôi → 1 → 3 → 5,
// chữ COMBO ×2 / ×4 không bao giờ hiện). Nước của đối thủ vẫn tính bình thường.
import { describe, expect, it } from "vitest";
import { NetworkController } from "./network-controller";
import { createGameForMap } from "./maps";
import type { ServerMsg, RoomState } from "./ws-types";
import type { WsClient } from "@/net/ws-client";
import { useConnection } from "@/net/ws-client";

class FakeWs {
  listeners = new Set<(m: ServerMsg) => void>();
  sent: unknown[] = [];
  subscribe(l: (m: ServerMsg) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  send(m: unknown) {
    this.sent.push(m);
    return true;
  }
  connect() {
    return Promise.resolve();
  }
  push(m: ServerMsg) {
    for (const l of this.listeners) l(m);
  }
}

// Bàn 3×3 (rules.ts): ngang r*3+c (0–11), dọc 12 + r*4 + c. Ô (0,0): 0, 3, 12, 13; ô (0,1): 1, 4, 13, 14.
function roomWith(edges: number[], turn: 0 | 1): RoomState {
  const g = createGameForMap("3x3");
  const e = [...g.edges];
  for (const i of edges) e[i] = turn;
  return {
    t: "room_state",
    roomId: "ROOM01",
    mode: "private",
    board: "3x3",
    turnSeconds: null,
    status: "playing",
    hostId: "me",
    players: [
      { userId: "me", name: "Tôi", seat: 0, online: true },
      { userId: "op", name: "Bạn", seat: 1, online: true },
    ],
    state: {
      rows: 3,
      cols: 3,
      edges: e,
      owners: [...g.owners],
      scores: [0, 0],
      turn,
      moveNo: edges.length,
      finished: false,
    },
  };
}

function setup(edges: number[], turn: 0 | 1) {
  useConnection.setState({ userId: "me" });
  const ws = new FakeWs();
  const c = new NetworkController(ws as unknown as WsClient, "ROOM01");
  c.start();
  ws.push(roomWith(edges, turn));
  return { ws, c };
}

const moved = (by: 0 | 1, edge: number, captured: number[], moveNo: number): ServerMsg => ({
  t: "moved",
  roomId: "ROOM01",
  by,
  edge,
  captured,
  scores: [0, 0],
  turn: by,
  moveNo,
});

describe("combo online", () => {
  it("server dội lại nước của mình không cộng combo lần hai", () => {
    const { ws, c } = setup([0, 3, 12, 1, 4], 0);
    expect(c.play(13)).toBe(true); // ăn ô (0,0)
    expect(c.getSession().combo).toBe(1);
    ws.push(moved(0, 13, [0], 6));
    expect(c.getSession().combo).toBe(1);
    expect(c.getSession().online?.pendingEdge).toBeNull();
    expect(c.play(14)).toBe(true); // ăn ô (0,1) ngay sau → ×2, không phải ×3
    expect(c.getSession().combo).toBe(2);
    ws.push(moved(0, 14, [1], 7));
    expect(c.getSession().combo).toBe(2);
  });

  it("nước của đối thủ tính combo bình thường, đổi lượt thì về 0", () => {
    const { ws, c } = setup([0, 3, 12, 1, 4], 1);
    ws.push(moved(1, 13, [0], 6));
    expect(c.getSession().combo).toBe(1);
    ws.push(moved(1, 14, [1], 7));
    expect(c.getSession().combo).toBe(2);
    ws.push(moved(1, 8, [], 8)); // không ăn → hết chuỗi
    expect(c.getSession().combo).toBe(0);
  });
});

// Độ bền (docs/04 — Kết nối lại, 2026-10-24): bỏ lỡ `moved` / STALE_SEQ → xin ảnh chụp mới;
// opponent_status về chính mình bị bỏ qua, graceUntil đi vào session.
describe("NetworkController đồng bộ lại khi lệch", () => {
  function start() {
    const ws = new FakeWs();
    const c = new NetworkController(ws as unknown as WsClient, "ROOM01");
    c.start();
    useConnection.setState({ userId: "me" });
    ws.push(roomWith([], 0));
    ws.sent.length = 0;
    return { ws, c };
  }

  it("bỏ lỡ moved (moveNo nhảy cóc) → gửi room_join thay vì áp nước", () => {
    const { ws, c } = start();
    ws.push({
      t: "moved",
      roomId: "ROOM01",
      by: 1,
      edge: 5,
      captured: [],
      scores: [0, 0],
      turn: 0,
      moveNo: 3, // server đã ở nước 3, ta mới thấy 0
      deadline: null,
      reason: "player",
    });
    expect(ws.sent).toEqual([{ t: "room_join", roomId: "ROOM01" }]);
    expect(c.getSession().state.moveNo).toBe(0);
  });

  it("STALE_SEQ → hoàn tác nước lạc quan và room_join", () => {
    const { ws, c } = start();
    expect(c.play(0)).toBe(true);
    expect(c.getSession().state.moveNo).toBe(1);
    ws.sent.length = 0;
    ws.push({ t: "error", code: "STALE_SEQ", message: "cũ", ref: "move" });
    expect(c.getSession().state.moveNo).toBe(0);
    expect(c.getSession().online?.pendingEdge).toBeNull();
    expect(ws.sent).toEqual([{ t: "room_join", roomId: "ROOM01" }]);
  });

  it("opponent_status: bỏ qua tin về mình, nhận graceUntil của đối thủ", () => {
    const { ws, c } = start();
    ws.push({ t: "opponent_status", roomId: "ROOM01", online: false, userId: "me" });
    expect(c.getSession().online?.opponentOnline).toBe(true);
    ws.push({
      t: "opponent_status",
      roomId: "ROOM01",
      online: false,
      userId: "them",
      graceUntil: 123456,
    });
    expect(c.getSession().online?.opponentOnline).toBe(false);
    expect(c.getSession().online?.graceUntil).toBe(123456);
    ws.push({ t: "opponent_status", roomId: "ROOM01", online: true, userId: "them" });
    expect(c.getSession().online?.graceUntil).toBeNull();
  });
});
