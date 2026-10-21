/**
 * BoardRenderer — vẽ bàn đấu bằng PixiJS v8 theo phong cách "giấy kem + nét bút" (docs/14),
 * bắt cạnh gần điểm chạm nhất (docs/11: không vùng chết), animation nét vẽ / ăn ô bằng GSAP.
 *
 * Chỉ chạy ở trình duyệt: pixi.js và gsap được import động trong `create()`.
 */
import type { GameResult, GameSession } from "../controller";
import { edgeCount, edgeEndpoints, horizontalEdgeCount, VOID, type Player } from "../rules";
import {
  seatSkins,
  type BoxSkin,
  type Particles,
  type PenParams,
  type PenSkin,
  type SeatSkins,
} from "../skins/skins";

type Pixi = typeof import("pixi.js");
type Gsap = typeof import("gsap").gsap;

export interface RendererColors {
  paper: number;
  paperShadow: number;
  grid: number;
  ink: number;
  pens: [number, number];
  /** Màu chữ COMBO / tia lấp lánh. */
  accent: number;
  /** Quầng đánh dấu các cạnh đối thủ vừa vẽ. */
  mark: number;
}

export const DEFAULT_COLORS: RendererColors = {
  paper: 0xfffcf2,
  paperShadow: 0x1a2826,
  grid: 0xc9d8f0,
  ink: 0x1a2826,
  pens: [0x1e4fd8, 0xd8341e],
  accent: 0xffd93d,
  mark: 0xffd93d,
};

/** Sự kiện hiệu ứng phát ra từ renderer (để màn chơi phát tiếng / hiện kết quả đúng lúc). */
export type RendererEvent =
  { type: "count"; owner: Player; n: number } | { type: "settled"; result: GameResult };

export interface BoardRendererOptions {
  onSelectEdge: (edge: number) => void;
  onEvent?: (event: RendererEvent) => void;
  colors?: Partial<RendererColors>;
  /** Chạm hai lần (xem trước rồi xác nhận) trên màn cảm ứng. */
  twoTapTouch?: boolean;
  /** Tôn trọng prefers-reduced-motion: bỏ animation, particle, rung. */
  reducedMotion?: boolean;
  /** Nhãn đã dịch — chữ "COMBO ×n" đi qua hàm t của giao diện, engine không tự dịch (docs/09). */
  labels?: { combo: (n: number) => string };
  /** Font chữ cho text vẽ trên canvas (mặc định: font của phần tử chứa). */
  fontFamily?: string;
}

interface Geometry {
  rows: number;
  cols: number;
  cell: number;
  offX: number;
  offY: number;
  width: number;
  height: number;
}

export class BoardRenderer {
  private constructor(
    private readonly px: Pixi,
    private readonly gsap: Gsap,
    private readonly app: InstanceType<Pixi["Application"]>,
    private readonly host: HTMLElement,
    private readonly opts: BoardRendererOptions,
  ) {
    this.colors = { ...DEFAULT_COLORS, ...opts.colors };
    const C = px.Container;
    this.layers = {
      paper: new C(),
      boxes: new C(),
      marks: new C(),
      edges: new C(),
      preview: new C(),
      dots: new C(),
      fx: new C(),
    };
    // `world` chứa toàn bộ bàn để rung (shake) mà không đụng hitArea của stage.
    this.world = new C();
    this.world.addChild(
      this.layers.paper,
      this.layers.boxes,
      this.layers.marks,
      this.layers.edges,
      this.layers.preview,
      this.layers.dots,
      this.layers.fx,
    );
    app.stage.addChild(this.world);
    this.previewG = new px.Graphics();
    this.layers.preview.addChild(this.previewG);
    this.fontFamily = opts.fontFamily || getComputedStyle(host).fontFamily || "sans-serif";
    this.bindPointer();
    app.renderer.on("resize", () => this.layout());
  }

  static async create(host: HTMLElement, opts: BoardRendererOptions): Promise<BoardRenderer> {
    const [px, { gsap }] = await Promise.all([import("pixi.js"), import("gsap")]);
    const app = new px.Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(app.canvas);
    app.canvas.style.touchAction = "none";
    app.canvas.style.display = "block";
    return new BoardRenderer(px, gsap, app, host, opts);
  }

  private readonly colors: RendererColors;
  /** Skin bút / ô theo ghế (docs/08, ADR-0013): mỗi bên thấy bút và ô của chính người vẽ. */
  private skins: SeatSkins = seatSkins(null, null);
  private readonly layers: Record<
    "paper" | "boxes" | "marks" | "edges" | "preview" | "dots" | "fx",
    InstanceType<Pixi["Container"]>
  >;
  private readonly world: InstanceType<Pixi["Container"]>;
  private readonly previewG: InstanceType<Pixi["Graphics"]>;
  private readonly fontFamily: string;
  private geo: Geometry | null = null;
  private session: GameSession | null = null;
  private edgeG = new Map<number, InstanceType<Pixi["Graphics"]>>();
  private boxG = new Map<number, InstanceType<Pixi["Container"]>>();
  private previewEdge: number | null = null;
  /** Khóa của quầng đánh dấu đang vẽ (tránh vẽ lại khi không đổi). */
  private marksKey = "";
  private interactive = true;
  private destroyed = false;
  /** Timeline đang chạy của phần đếm ô cuối ván (hủy khi ván mới). */
  private countTl: ReturnType<Gsap["timeline"]> | null = null;
  private shakeTl: ReturnType<Gsap["timeline"]> | null = null;

  // ---------- Public ----------

  setSession(session: GameSession) {
    if (this.destroyed) return;
    const prev = this.session;
    this.session = session;
    const sizeChanged =
      !prev || prev.state.rows !== session.state.rows || prev.state.cols !== session.state.cols;
    const restarted = prev && session.state.moveNo < prev.state.moveNo;
    if (sizeChanged || restarted) {
      this.resetBoard();
      this.layout();
      return;
    }
    this.syncPieces();
    this.setPreview(null);
    // Hiệu ứng theo diễn biến: combo (chữ nổ + rung), kết thúc ván (đếm ô).
    const { lastMove, combo, result } = session;
    const moved = !!prev && session.state.moveNo > prev.state.moveNo && !!lastMove;
    if (moved && lastMove.captured.length > 0 && combo >= 2 && !this.opts.reducedMotion) {
      this.popCombo(lastMove.captured, lastMove.by, combo);
      const shakeFrom = this.skins.pens[lastMove.by].combo.shakeFrom;
      if (combo >= shakeFrom) this.shake(Math.min(1, (combo - shakeFrom + 1) / 4));
    }
    if (result && !prev?.result) this.settle(result);
  }

  /** Đổi bộ skin theo ghế; vẽ lại toàn bộ nếu đã có ván (xem trước trong shop đổi tức thì). */
  setSkins(skins: SeatSkins) {
    if (this.destroyed) return;
    const same =
      skins.pens[0] === this.skins.pens[0] &&
      skins.pens[1] === this.skins.pens[1] &&
      skins.boxes[0] === this.skins.boxes[0] &&
      skins.boxes[1] === this.skins.boxes[1];
    if (same) return;
    this.skins = skins;
    if (this.session && this.geo) this.redrawAllPieces();
  }

  /** Bật/tắt chạm hai lần (bàn 7×7 trên màn hình hẹp) mà không tạo lại renderer. */
  setTwoTapTouch(on: boolean) {
    this.opts.twoTapTouch = on;
    this.setPreview(null);
  }

  setInteractive(on: boolean) {
    if (this.destroyed) return;
    this.interactive = on;
    if (!on) this.setPreview(null);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gsap.globalTimeline.getChildren().forEach((t) => t.kill());
    this.app.destroy(true, { children: true });
  }

  // ---------- Hình học ----------

  private layout() {
    if (this.destroyed || !this.session) return;
    const { rows, cols } = this.session.state;
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const size = Math.min(width, height);
    // Chừa lề giấy (0.55 ô mỗi bên, xem drawPaper) + bóng để giấy không bị cắt ở mép canvas.
    const pad = size * 0.02;
    const cell = (size - pad * 2) / (Math.max(rows, cols) + 1.3);
    this.geo = {
      rows,
      cols,
      cell,
      offX: (width - cols * cell) / 2,
      offY: (height - rows * cell) / 2,
      width,
      height,
    };
    this.drawPaper();
    this.drawDots();
    this.redrawAllPieces();
  }

  private dot(r: number, c: number) {
    const g = this.geo!;
    return { x: g.offX + c * g.cell, y: g.offY + r * g.cell };
  }

  /** Ô (r, c) có thuộc bàn không (map hình thù: ngoài mặt nạ là VOID). */
  private isLive(r: number, c: number): boolean {
    const g = this.geo!;
    if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) return false;
    return this.session!.state.owners[r * g.cols + c] !== VOID;
  }

  private drawPaper() {
    if (this.session!.state.owners.includes(VOID)) {
      this.drawShapedPaper();
      return;
    }
    const g = this.geo!;
    const { rows, cols, cell } = g;
    const paper = this.layers.paper;
    paper.removeChildren();
    const gfx = new this.px.Graphics();
    const m = cell * 0.55; // lề giấy quanh lưới chấm
    const x = g.offX - m;
    const y = g.offY - m;
    const w = cols * cell + m * 2;
    const h = rows * cell + m * 2;
    const radius = Math.min(24, cell * 0.45);
    const shadow = Math.max(3, cell * 0.08);
    // Bóng cứng lệch góc rồi tờ giấy viền đen (docs/14).
    gfx
      .roundRect(x + shadow, y + shadow, w, h, radius)
      .fill({ color: this.colors.paperShadow, alpha: 0.85 });
    gfx
      .roundRect(x, y, w, h, radius)
      .fill(this.colors.paper)
      .stroke({ width: 3, color: this.colors.ink });
    // Lưới ô li mờ (mỗi ô chia 2).
    const step = cell / 2;
    for (let gx = x + step / 2; gx < x + w; gx += step) {
      gfx.moveTo(gx, y + 2).lineTo(gx, y + h - 2);
    }
    for (let gy = y + step / 2; gy < y + h; gy += step) {
      gfx.moveTo(x + 2, gy).lineTo(x + w - 2, gy);
    }
    gfx.stroke({ width: 1, color: this.colors.grid, alpha: 0.6 });
    paper.addChild(gfx);
  }

  /**
   * Giấy theo hình map: mỗi ô thuộc bàn là một mảnh giấy nới lề `m`; các mảnh chồng nhau thành hình
   * liền. Viền mực = cùng các mảnh nới thêm bề dày nét, vẽ bên dưới. Lề < nửa ô nên lỗ 1 ô vẫn hở
   * giữa (thấy rõ là lỗ). Lưới ô li cắt theo hình bằng mask.
   */
  private drawShapedPaper() {
    const g = this.geo!;
    const { rows, cols, cell } = g;
    const paper = this.layers.paper;
    paper.removeChildren();
    const m = cell * 0.3;
    const ink = 3;
    const radius = Math.min(14, cell * 0.3);
    const shadow = Math.max(3, cell * 0.08);
    const live: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (this.isLive(r, c)) live.push(this.dot(r, c));
    const pieces = (gfx: InstanceType<Pixi["Graphics"]>, grow: number, dx = 0, dy = 0) => {
      for (const p of live) {
        gfx.roundRect(
          p.x - m - grow + dx,
          p.y - m - grow + dy,
          cell + (m + grow) * 2,
          cell + (m + grow) * 2,
          radius + grow,
        );
      }
      return gfx;
    };
    const shadowG = pieces(new this.px.Graphics(), ink, shadow, shadow).fill(
      this.colors.paperShadow,
    );
    const inkG = pieces(new this.px.Graphics(), ink).fill(this.colors.ink);
    const sheet = pieces(new this.px.Graphics(), 0).fill(this.colors.paper);
    const clip = pieces(new this.px.Graphics(), 0).fill(0xffffff);
    const grid = new this.px.Graphics();
    const x0 = g.offX - m;
    const y0 = g.offY - m;
    const w = cols * cell + m * 2;
    const h = rows * cell + m * 2;
    const step = cell / 2;
    for (let gx = x0 + step / 2; gx < x0 + w; gx += step) grid.moveTo(gx, y0).lineTo(gx, y0 + h);
    for (let gy = y0 + step / 2; gy < y0 + h; gy += step) grid.moveTo(x0, gy).lineTo(x0 + w, gy);
    grid.stroke({ width: 1, color: this.colors.grid, alpha: 0.6 });
    grid.mask = clip;
    paper.addChild(shadowG, inkG, sheet, grid, clip);
  }

  private drawDots() {
    const g = this.geo!;
    const dots = this.layers.dots;
    dots.removeChildren();
    const gfx = new this.px.Graphics();
    const r = Math.max(2.5, g.cell * 0.085);
    for (let i = 0; i <= g.rows; i++) {
      for (let j = 0; j <= g.cols; j++) {
        // Chỉ chấm là góc của ít nhất một ô thuộc bàn.
        const touches =
          this.isLive(i - 1, j - 1) ||
          this.isLive(i - 1, j) ||
          this.isLive(i, j - 1) ||
          this.isLive(i, j);
        if (!touches) continue;
        const p = this.dot(i, j);
        gfx.circle(p.x, p.y, r);
      }
    }
    gfx.fill(this.colors.ink);
    dots.addChild(gfx);
  }

  // ---------- Cạnh & ô ----------

  private resetBoard() {
    this.countTl?.kill();
    this.countTl = null;
    this.shakeTl?.kill();
    this.shakeTl = null;
    this.world.position.set(0, 0);
    this.layers.fx.removeChildren();
    this.layers.edges.removeChildren();
    this.layers.boxes.removeChildren();
    this.layers.marks.removeChildren();
    this.marksKey = "";
    this.edgeG.clear();
    this.boxG.clear();
    this.previewEdge = null;
    this.previewG.clear();
  }

  private redrawAllPieces() {
    this.resetBoard();
    this.syncPieces(true);
  }

  /** Thêm các cạnh/ô mới có trong state; animate riêng nước vừa đi. */
  private syncPieces(instant = false) {
    if (!this.geo || !this.session) return;
    const { state, lastMove } = this.session;
    const animate = !instant && !this.opts.reducedMotion;
    for (let e = 0; e < state.edges.length; e++) {
      const owner = state.edges[e];
      if (owner === -1 || owner === VOID || this.edgeG.has(e)) continue;
      const isLast = lastMove?.edge === e;
      this.addEdge(e, owner, animate && isLast);
    }
    for (let b = 0; b < state.owners.length; b++) {
      const owner = state.owners[b];
      if (owner === -1 || owner === VOID || this.boxG.has(b)) continue;
      const isLast = lastMove?.captured.includes(b) ?? false;
      this.addBox(b, owner, animate && isLast);
    }
    this.drawMarks();
  }

  /** Quầng dưới các cạnh đối thủ vẽ trong lượt gần nhất (nếu luật phòng / cài đặt cho phép). */
  private drawMarks() {
    const s = this.session!;
    const turn = s.lastTurn;
    const on = s.showLastMove && !s.result && !!turn && turn.by !== s.human;
    const key = on ? `${this.geo!.cell}|${turn!.edges.join(",")}` : "";
    if (key === this.marksKey) return;
    this.marksKey = key;
    const layer = this.layers.marks;
    layer.removeChildren();
    if (!on) return;
    const gfx = new this.px.Graphics();
    for (const edge of turn!.edges) {
      const pts = this.strokePoints(edge);
      gfx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts.slice(1)) gfx.lineTo(pt.x, pt.y);
    }
    gfx.stroke({
      width: Math.max(8, this.geo!.cell * 0.3),
      color: this.colors.mark,
      alpha: 0.7,
      cap: "round",
      join: "round",
    });
    layer.addChild(gfx);
    if (!this.opts.reducedMotion) {
      gfx.alpha = 0;
      this.gsap.to(gfx, { alpha: 1, duration: 0.25, delay: 0.1 });
    }
  }

  /** Điểm trên nét vẽ với độ run tay ổn định theo id cạnh (`jitter` = hệ số theo skin bút). */
  private strokePoints(edge: number, jitter = 1, n = 6): { x: number; y: number }[] {
    const g = this.geo!;
    const [a, b] = edgeEndpoints(g.rows, g.cols, edge);
    const p0 = this.dot(a.r, a.c);
    const p1 = this.dot(b.r, b.c);
    const amp = g.cell * 0.03 * jitter;
    const nx = -(p1.y - p0.y);
    const ny = p1.x - p0.x;
    const len = Math.hypot(nx, ny) || 1;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Hash tất định: run ở giữa, về 0 ở hai đầu.
      const h = Math.sin((edge + 1) * 12.9898 + i * 78.233) * 43758.5453;
      const jitter = (h - Math.floor(h) - 0.5) * 2 * amp * Math.sin(Math.PI * t);
      pts.push({
        x: p0.x + (p1.x - p0.x) * t + (nx / len) * jitter,
        y: p0.y + (p1.y - p0.y) * t + (ny / len) * jitter,
      });
    }
    return pts;
  }

  /** Màu nét của một cạnh: màu người chơi, hoặc pha cầu vồng theo id cạnh (bút cầu vồng). */
  private strokeColor(edge: number, owner: Player, pen: PenParams): number {
    const base = this.colors.pens[owner];
    if (pen.hue !== "rainbow") return base;
    const RAINBOW = [0xff5f5f, 0xffa64d, 0xffe14d, 0x6ee77a, 0x4fc3ff, 0x8a7bff, 0xff7bd6];
    return blend(RAINBOW[edge % RAINBOW.length], base, 0.4);
  }

  /**
   * Vẽ một nét (toàn bộ hoặc tới `progress`) theo tham số skin bút: bề dày, mờ, run tay, đầu nét,
   * quầng sáng (glow), nét đứt (dash), thanh đậm (taper).
   */
  private drawStroke(
    gfx: InstanceType<Pixi["Graphics"]>,
    edge: number,
    color: number,
    progress: number,
    alpha = 1,
    pen: PenParams = this.skins.pens[0].pen,
  ) {
    const g = this.geo!;
    const n = pen.dash || pen.taper ? 24 : 6;
    const pts = this.strokePoints(edge, pen.jitter ?? 1, n);
    gfx.clear();
    const total = pts.length - 1;
    const upto = total * Math.min(1, Math.max(0, progress));
    const full = Math.floor(upto);
    // Điểm cuối nội suy để nét "chạy".
    const poly = pts.slice(0, full + 1);
    if (full < total) {
      const t = upto - full;
      const a = pts[full];
      const b = pts[full + 1];
      poly.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    const width = Math.max(3, g.cell * 0.09) * pen.width;
    const cap = pen.cap ?? "round";
    const a = alpha * (pen.alpha ?? 1);
    if (pen.glow && alpha >= 1) {
      // Quầng sáng: nét rộng mờ bên dưới.
      gfx.moveTo(poly[0].x, poly[0].y);
      for (const q of poly.slice(1)) gfx.lineTo(q.x, q.y);
      gfx.stroke({
        width: width * 2.6,
        color: parseHex(pen.glow),
        alpha: 0.35,
        cap,
        join: "round",
      });
    }
    if (pen.taper) {
      // Thanh đậm: từng đoạn với bề dày theo sin(πt) (mảnh hai đầu, dày giữa).
      for (let i = 1; i < poly.length; i++) {
        const t = i / total;
        const w = width * (0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, t)));
        gfx.moveTo(poly[i - 1].x, poly[i - 1].y).lineTo(poly[i].x, poly[i].y);
        gfx.stroke({ width: w, color, alpha: a, cap: "round", join: "round" });
      }
      return;
    }
    if (pen.dash) {
      // Nét đứt: lặp [vẽ, hở] theo tỷ lệ ô; vẽ các đoạn con nằm trong phần "vẽ".
      const [on, off] = pen.dash;
      const period = (on + off) * g.cell;
      let dist = 0;
      for (let i = 1; i < poly.length; i++) {
        const seg = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
        const phase = (dist % period) / g.cell;
        if (phase < on * 0.98) {
          gfx.moveTo(poly[i - 1].x, poly[i - 1].y).lineTo(poly[i].x, poly[i].y);
        }
        dist += seg;
      }
      gfx.stroke({ width, color, alpha: a, cap, join: "round" });
      return;
    }
    gfx.moveTo(poly[0].x, poly[0].y);
    for (const q of poly.slice(1)) gfx.lineTo(q.x, q.y);
    gfx.stroke({ width, color, alpha: a, cap, join: "round" });
  }

  private addEdge(edge: number, owner: Player, animate: boolean) {
    const gfx = new this.px.Graphics();
    this.layers.edges.addChild(gfx);
    this.edgeG.set(edge, gfx);
    const pen = this.skins.pens[owner].pen;
    const color = this.strokeColor(edge, owner, pen);
    if (!animate) {
      this.drawStroke(gfx, edge, color, 1, 1, pen);
      return;
    }
    const tween = { p: 0 };
    this.gsap.to(tween, {
      p: 1,
      duration: 0.18,
      ease: "power2.out",
      onUpdate: () => !this.destroyed && this.drawStroke(gfx, edge, color, tween.p, 1, pen),
    });
  }

  private addBox(box: number, owner: Player, animate: boolean) {
    const g = this.geo!;
    const r = Math.floor(box / g.cols);
    const c = box % g.cols;
    const p = this.dot(r, c);
    const color = this.colors.pens[owner];
    const inset = g.cell * 0.12;
    const size = g.cell - inset * 2;
    const container = new this.px.Container();
    container.position.set(p.x + g.cell / 2, p.y + g.cell / 2);
    const skin = this.skins.boxes[owner];
    container.addChild(this.drawBoxEffect(skin, box, color, size));
    this.layers.boxes.addChild(container);
    this.boxG.set(box, container);
    if (animate) {
      container.alpha = 0;
      const from = skin.box.effect === "stamp" || skin.box.effect === "seal" ? 1.6 : 0.6;
      container.scale.set(from);
      this.gsap.to(container, { alpha: 1, duration: 0.2 });
      this.gsap.to(container.scale, {
        x: 1,
        y: 1,
        duration: from > 1 ? 0.22 : 0.35,
        ease: from > 1 ? "power3.in" : "back.out(2)",
      });
      this.burst(container.x, container.y, color, skin.box.particles);
    }
  }

  /** Hình ô đã ăn theo hiệu ứng của skin (docs/08: danh sách hiệu ứng cố định trong engine). */
  private drawBoxEffect(
    skin: BoxSkin,
    box: number,
    color: number,
    size: number,
  ): InstanceType<Pixi["Container"]> {
    const g = this.geo!;
    const gfx = new this.px.Graphics();
    const { effect, alpha } = skin.box;
    const thin = Math.max(1.5, g.cell * 0.035);
    const h = size / 2;
    const hatch = (dir: 1 | -1) => {
      const step = size / 4;
      for (let i = -size; i < size; i += step) {
        const x0 = Math.max(-h, i);
        const x1 = Math.min(h, i + size);
        if (dir === 1) gfx.moveTo(x0, Math.max(-h, -i - size)).lineTo(x1, Math.min(h, -i));
        else gfx.moveTo(x0, -Math.max(-h, -i - size)).lineTo(x1, -Math.min(h, -i));
      }
    };
    switch (effect) {
      case "fill":
        gfx.roundRect(-h, -h, size, size, size * 0.12).fill({ color, alpha });
        break;
      case "crosshatch":
        gfx.roundRect(-h, -h, size, size, size * 0.12).fill({ color, alpha });
        hatch(1);
        hatch(-1);
        gfx.stroke({ width: thin, color, alpha: 0.55, cap: "round" });
        break;
      case "dots": {
        gfx.roundRect(-h, -h, size, size, size * 0.12).fill({ color, alpha: alpha * 0.5 });
        const r = size * 0.09;
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++)
            gfx.circle(-h + size * (0.2 + i * 0.3), -h + size * (0.2 + j * 0.3), r);
        gfx.fill({ color, alpha: 0.7 });
        break;
      }
      case "scribble": {
        // Đường zigzag tất định theo id ô.
        let seed = box * 7919 + 13;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        gfx.moveTo(-h * 0.8, -h * 0.7);
        for (let i = 0; i < 9; i++)
          gfx.lineTo((rnd() * 2 - 1) * h * 0.85, (rnd() * 2 - 1) * h * 0.85);
        gfx.stroke({ width: thin * 1.6, color, alpha: 0.6, cap: "round", join: "round" });
        break;
      }
      case "star":
        gfx.star(0, 0, 5, h * 0.9, h * 0.42, -Math.PI / 2).fill({ color, alpha: alpha + 0.3 });
        gfx.stroke({ width: thin, color, alpha: 0.9, join: "round" });
        break;
      case "stamp": {
        gfx.circle(0, 0, h * 0.78).stroke({ width: thin * 2, color, alpha: 0.85 });
        gfx.circle(0, 0, h * 0.62).stroke({ width: thin, color, alpha: 0.6 });
        const t = this.makeText("10", color, size * 0.5, false);
        t.alpha = 0.9;
        const c = new this.px.Container();
        c.addChild(gfx, t);
        c.rotation = ((box % 5) - 2) * 0.12;
        return c;
      }
      case "heart": {
        const w = h * 0.95;
        gfx
          .moveTo(0, w * 0.75)
          .bezierCurveTo(-w * 1.35, -w * 0.1, -w * 0.6, -w * 1.05, 0, -w * 0.4)
          .bezierCurveTo(w * 0.6, -w * 1.05, w * 1.35, -w * 0.1, 0, w * 0.75)
          .closePath()
          .fill({ color, alpha: alpha + 0.25 })
          .stroke({ width: thin, color, alpha: 0.9, join: "round" });
        break;
      }
      case "seal":
        gfx.circle(0, 0, h * 0.86).fill({ color: this.colors.accent, alpha: 0.95 });
        gfx
          .circle(0, 0, h * 0.86)
          .stroke({ width: thin * 1.4, color: this.colors.ink, alpha: 0.9 });
        gfx.star(0, 0, 5, h * 0.55, h * 0.26, -Math.PI / 2).fill({ color, alpha: 0.95 });
        break;
      case "hatch":
      default:
        gfx.roundRect(-h, -h, size, size, size * 0.12).fill({ color, alpha });
        hatch(1);
        gfx.stroke({ width: thin, color, alpha: 0.55, cap: "round" });
    }
    return gfx;
  }

  // ---------- Hiệu ứng (docs/08 — Animation & Âm thanh) ----------

  private boxCenter(box: number) {
    const g = this.geo!;
    const p = this.dot(Math.floor(box / g.cols), box % g.cols);
    return { x: p.x + g.cell / 2, y: p.y + g.cell / 2 };
  }

  private makeText(
    text: string,
    fill: number,
    fontSize: number,
    sticker = true,
    strokeColor = this.colors.ink,
  ) {
    const t = new this.px.Text({
      text,
      style: {
        fontFamily: this.fontFamily,
        fontSize,
        fontWeight: "700",
        fill,
        stroke: sticker
          ? { color: strokeColor, width: Math.max(2, fontSize * 0.11), join: "round" }
          : undefined,
        dropShadow: sticker
          ? {
              color: this.colors.ink,
              alpha: 0.85,
              blur: 0,
              angle: Math.PI / 4,
              distance: Math.max(2, fontSize * 0.1),
            }
          : undefined,
      },
    });
    t.anchor.set(0.5);
    return t;
  }

  /**
   * Vụn bắn ra từ ô vừa ăn theo loại của skin (docs/08): `paper` chữ nhật giấy có trọng lực,
   * `ink` giọt mực, `chalk` bụi phấn trắng, `spark` tia điện không rơi, `star` sao vàng.
   */
  private burst(
    x: number,
    y: number,
    color: number,
    kind: Particles = "paper",
    count = 10,
    spread = 1,
  ) {
    if (this.opts.reducedMotion) return;
    const g = this.geo!;
    const layer = this.layers.fx;
    const palettes: Record<Particles, number[]> = {
      paper: [color, color, this.colors.paper, this.colors.accent],
      ink: [color, color, color, blend(color, this.colors.ink, 0.4)],
      chalk: [0xffffff, 0xf2f2f2, 0xe0e0e0, color],
      spark: [color, this.colors.accent, 0xffffff, color],
      star: [this.colors.accent, this.colors.accent, this.colors.paper, color],
    };
    const palette = palettes[kind];
    const parts: { s: InstanceType<Pixi["Graphics"]>; vx: number; vy: number; rot: number }[] = [];
    const speed = g.cell * (kind === "spark" ? 2.4 : 1.6) * spread;
    const n = kind === "spark" || kind === "chalk" ? Math.round(count * 1.4) : count;
    for (let i = 0; i < n; i++) {
      const s = new this.px.Graphics();
      const c = palette[i % palette.length];
      const w = g.cell * (0.08 + Math.random() * 0.1);
      const h = g.cell * (0.05 + Math.random() * 0.06);
      switch (kind) {
        case "ink":
          s.circle(0, 0, g.cell * (0.03 + Math.random() * 0.05)).fill({ color: c, alpha: 0.85 });
          break;
        case "chalk":
          s.rect(-h / 2, -h / 2, h, h).fill({ color: c, alpha: 0.8 });
          break;
        case "spark":
          s.moveTo(-w * 0.8, 0)
            .lineTo(w * 0.8, 0)
            .stroke({ width: Math.max(1.5, h * 0.5), color: c });
          break;
        case "star":
          s.star(0, 0, 5, h * 1.1, h * 0.5)
            .fill(c)
            .stroke({ width: 1, color: this.colors.ink, alpha: 0.6 });
          break;
        case "paper":
        default:
          s.roundRect(-w / 2, -h / 2, w, h, h * 0.3)
            .fill(c)
            .stroke({ width: 1, color: this.colors.ink, alpha: 0.7 });
      }
      s.position.set(x, y);
      s.rotation = Math.random() * Math.PI;
      layer.addChild(s);
      const ang = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.5);
      parts.push({
        s,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - (kind === "spark" ? 0 : speed * 0.5),
        rot: kind === "spark" ? 0 : (Math.random() - 0.5) * 12,
      });
      if (kind === "spark") s.rotation = ang;
    }
    const tween = { t: 0 };
    const dur = (kind === "spark" ? 0.3 : 0.55) + Math.random() * 0.2;
    const gravity = kind === "spark" ? 0 : kind === "chalk" ? g.cell * 2.5 : g.cell * 6;
    this.gsap.to(tween, {
      t: 1,
      duration: dur,
      ease: "none",
      onUpdate: () => {
        if (this.destroyed) return;
        const t = tween.t * dur;
        for (const p of parts) {
          p.s.x = x + p.vx * t;
          p.s.y = y + p.vy * t + gravity * t * t;
          p.s.rotation += p.rot * 0.016;
          p.s.alpha = 1 - tween.t * tween.t;
        }
      },
      onComplete: () => {
        if (this.destroyed) return;
        for (const p of parts) p.s.destroy();
      },
    });
  }

  /** Chữ "COMBO ×n" nổ ra tại ô vừa ăn: phóng to nảy, xoay nhẹ, bay lên rồi tan. */
  private popCombo(boxes: number[], by: Player, combo: number) {
    const g = this.geo!;
    const label = this.opts.labels?.combo(combo) ?? `COMBO ×${combo}`;
    const centers = boxes.map((b) => this.boxCenter(b));
    const cx = centers.reduce((a, c) => a + c.x, 0) / centers.length;
    const cy = centers.reduce((a, c) => a + c.y, 0) / centers.length;
    const fontSize = Math.max(20, Math.min(46, g.cell * 0.5 + combo * 2));
    const skin: PenSkin = this.skins.pens[by];
    const penColor = this.colors.pens[by];
    const text = this.comboText(label, skin, penColor, fontSize);
    // Giữ chữ trong khung canvas.
    const halfW = text.width / 2 + 4;
    const x = Math.min(g.width - halfW, Math.max(halfW, cx));
    const y = Math.max(fontSize, cy - g.cell * 0.2);
    text.position.set(x, y);
    text.scale.set(0.2);
    text.rotation = (Math.random() - 0.5) * (skin.combo.style === "ink" ? 0.5 : 0.3);
    this.layers.fx.addChild(text);
    this.burst(x, y, penColor, skin.combo.particles, 6 + combo * 2, 1.4);
    if (skin.combo.style === "sparkle") this.burst(x, y, penColor, "star", 8, 1.8);
    const tl = this.gsap.timeline({
      onComplete: () => {
        if (!this.destroyed) text.destroy();
      },
    });
    tl.to(text.scale, { x: 1.15, y: 1.15, duration: 0.28, ease: "back.out(3)" })
      .to(text, { rotation: 0, duration: 0.28 }, 0)
      .to(text.scale, { x: 1, y: 1, duration: 0.15 })
      .to(text, { y: y - g.cell * 0.6, alpha: 0, duration: 0.45, ease: "power1.in" }, "+=0.35");
  }

  /** Chữ COMBO theo kiểu của skin bút (docs/08): sticker, mực, phấn, neon, lấp lánh. */
  private comboText(label: string, skin: PenSkin, penColor: number, fontSize: number) {
    switch (skin.combo.style) {
      case "ink":
        return this.makeText(label, penColor, fontSize, true, this.colors.paper);
      case "chalk": {
        const t = this.makeText(label, 0xffffff, fontSize, false);
        t.alpha = 0.92;
        return t;
      }
      case "neon": {
        const glow = skin.pen.glow ? parseHex(skin.pen.glow) : this.colors.accent;
        return this.makeText(label, glow, fontSize * 1.1, true, penColor);
      }
      case "sparkle":
        return this.makeText(label, this.colors.accent, fontSize * 1.1, true, this.colors.ink);
      case "sticker":
      default:
        return this.makeText(label, this.colors.accent, fontSize);
    }
  }

  /** Rung bàn nhẹ (combo ≥ 3). `intensity` 0–1. */
  private shake(intensity: number) {
    if (this.opts.reducedMotion) return;
    this.shakeTl?.kill();
    const amp = 2 + intensity * 5;
    const pos = this.world.position;
    const tl = this.gsap.timeline({ onComplete: () => pos.set(0, 0) });
    for (let i = 0; i < 6; i++) {
      const k = 1 - i / 6;
      tl.to(pos, {
        x: (Math.random() - 0.5) * 2 * amp * k,
        y: (Math.random() - 0.5) * 2 * amp * k,
        duration: 0.035,
      });
    }
    tl.to(pos, { x: 0, y: 0, duration: 0.05 });
    this.shakeTl = tl;
  }

  /**
   * Kết thúc ván: đếm ô từng người (ô nảy lần lượt + số to giữa bàn), xong mới báo `settled`
   * để màn chơi hiện kết quả. Đầu hàng hoặc giảm hiệu ứng → báo ngay.
   */
  private settle(result: GameResult) {
    const s = this.session!;
    const emit = (e: RendererEvent) => {
      if (!this.destroyed) this.opts.onEvent?.(e);
    };
    const done = () => emit({ type: "settled", result });
    if (result.reason !== "complete" || this.opts.reducedMotion || !this.geo) {
      this.countTl = this.gsap.timeline().call(done, [], result.reason === "complete" ? 0.1 : 0.3);
      return;
    }
    const g = this.geo;
    const owners = s.state.owners;
    const order: Player[] = [s.human, s.bot];
    const total = owners.filter((o) => o >= 0).length;
    const step = Math.max(0.024, Math.min(0.08, 1.3 / Math.max(1, total)));
    const counter = this.makeText("", this.colors.pens[s.human], Math.max(28, g.cell * 1.1));
    counter.position.set(g.width / 2, g.height / 2);
    counter.alpha = 0;
    this.layers.fx.addChild(counter);
    const tl = this.gsap.timeline({
      delay: 0.45,
      onComplete: () => {
        if (this.destroyed) return;
        counter.destroy();
        this.countTl = null;
        done();
      },
    });
    for (const owner of order) {
      let n = 0;
      for (let b = 0; b < owners.length; b++) {
        if (owners[b] !== owner) continue;
        n += 1;
        const count = n;
        const box = this.boxG.get(b);
        tl.call(() => {
          if (this.destroyed) return;
          counter.text = String(count);
          counter.style.fill = this.colors.pens[owner];
          counter.alpha = 1;
          counter.scale.set(1.25);
          this.gsap.to(counter.scale, { x: 1, y: 1, duration: 0.18, ease: "power2.out" });
          if (box) {
            box.scale.set(1.3);
            this.gsap.to(box.scale, { x: 1, y: 1, duration: 0.25, ease: "back.out(2)" });
          }
          emit({ type: "count", owner, n: count });
        });
        tl.to({}, { duration: step });
      }
      if (n > 0) tl.to(counter, { alpha: 0, duration: 0.2 }, "+=0.35");
    }
    this.countTl = tl;
  }

  // ---------- Tương tác ----------

  private bindPointer() {
    const stage = this.app.stage;
    stage.eventMode = "static";
    stage.hitArea = this.app.screen;
    stage.on("pointermove", (e) => {
      if (e.pointerType === "touch") return; // chạm: không hover
      this.setPreview(this.canInteract() ? this.nearestFreeEdge(e.global.x, e.global.y) : null);
    });
    stage.on("pointerleave", () => this.setPreview(null));
    stage.on("pointertap", (e) => {
      if (!this.canInteract()) return;
      const edge = this.nearestFreeEdge(e.global.x, e.global.y);
      if (edge === null) return;
      const twoTap = this.opts.twoTapTouch && e.pointerType === "touch";
      if (twoTap && this.previewEdge !== edge) {
        this.setPreview(edge);
        return;
      }
      this.setPreview(null);
      this.opts.onSelectEdge(edge);
    });
  }

  private canInteract() {
    const s = this.session;
    return !!s && this.interactive && !s.result && !s.thinking && s.state.turn === s.human;
  }

  /** Cạnh chưa vẽ gần điểm (x, y) nhất; null nếu ngoài bàn quá xa. */
  nearestFreeEdge(x: number, y: number): number | null {
    const g = this.geo;
    const s = this.session;
    if (!g || !s) return null;
    const { rows, cols, cell, offX, offY } = g;
    const margin = cell * 0.6;
    if (x < offX - margin || x > offX + cols * cell + margin) return null;
    if (y < offY - margin || y > offY + rows * cell + margin) return null;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    // Ứng viên ngang: hàng chấm gần nhất, cột ô chứa x.
    const hr = clamp(Math.round((y - offY) / cell), 0, rows);
    const hc = clamp(Math.floor((x - offX) / cell), 0, cols - 1);
    const hDist = Math.abs(y - (offY + hr * cell));
    const hEdge = hr * cols + hc;
    // Ứng viên dọc.
    const vc = clamp(Math.round((x - offX) / cell), 0, cols);
    const vr = clamp(Math.floor((y - offY) / cell), 0, rows - 1);
    const vDist = Math.abs(x - (offX + vc * cell));
    const vEdge = horizontalEdgeCount(rows, cols) + vr * (cols + 1) + vc;
    const order = hDist <= vDist ? [hEdge, vEdge] : [vEdge, hEdge];
    for (const e of order) {
      if (e >= 0 && e < edgeCount(rows, cols) && s.state.edges[e] === -1) return e;
    }
    // Map hình thù: hai ứng viên có thể là cạnh ngoài bàn (VOID) → lấy cạnh trống gần nhất
    // trong bán kính 0.6 ô để chạm sát mép hình vẫn trúng.
    let best: number | null = null;
    let bestDist = cell * 0.6;
    for (let e = 0; e < s.state.edges.length; e++) {
      if (s.state.edges[e] !== -1) continue;
      const [a, b] = edgeEndpoints(rows, cols, e);
      const mx = offX + ((a.c + b.c) / 2) * cell;
      const my = offY + ((a.r + b.r) / 2) * cell;
      // Khoảng cách tới đoạn thẳng (ngang/dọc, dài 1 ô).
      const dx = a.r === b.r ? Math.max(0, Math.abs(x - mx) - cell / 2) : Math.abs(x - mx);
      const dy = a.r === b.r ? Math.abs(y - my) : Math.max(0, Math.abs(y - my) - cell / 2);
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private setPreview(edge: number | null) {
    if (this.previewEdge === edge) return;
    this.previewEdge = edge;
    this.previewG.clear();
    if (edge === null || !this.session) return;
    const seat = this.session.human;
    const pen = this.skins.pens[seat].pen;
    this.drawStroke(this.previewG, edge, this.strokeColor(edge, seat, pen), 1, 0.35, pen);
    this.host.style.cursor = "pointer";
  }
}

// ---------- Màu ----------

function parseHex(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/** Pha hai màu: `t` = 0 → a, 1 → b. */
function blend(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) & 0xff;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
