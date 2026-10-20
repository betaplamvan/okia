/**
 * BoardRenderer — vẽ bàn đấu bằng PixiJS v8 theo phong cách "giấy kem + nét bút" (docs/14),
 * bắt cạnh gần điểm chạm nhất (docs/11: không vùng chết), animation nét vẽ / ăn ô bằng GSAP.
 *
 * Chỉ chạy ở trình duyệt: pixi.js và gsap được import động trong `create()`.
 */
import type { GameSession } from "../controller";
import { edgeCount, edgeEndpoints, horizontalEdgeCount, type Player } from "../rules";

type Pixi = typeof import("pixi.js");
type Gsap = typeof import("gsap").gsap;

export interface RendererColors {
  paper: number;
  paperShadow: number;
  grid: number;
  ink: number;
  pens: [number, number];
}

export const DEFAULT_COLORS: RendererColors = {
  paper: 0xfffcf2,
  paperShadow: 0x1a2826,
  grid: 0xc9d8f0,
  ink: 0x1a2826,
  pens: [0x1e4fd8, 0xd8341e],
};

export interface BoardRendererOptions {
  onSelectEdge: (edge: number) => void;
  colors?: Partial<RendererColors>;
  /** Chạm hai lần (xem trước rồi xác nhận) trên màn cảm ứng. */
  twoTapTouch?: boolean;
  /** Tôn trọng prefers-reduced-motion: bỏ animation. */
  reducedMotion?: boolean;
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
      edges: new C(),
      preview: new C(),
      dots: new C(),
    };
    app.stage.addChild(
      this.layers.paper,
      this.layers.boxes,
      this.layers.edges,
      this.layers.preview,
      this.layers.dots,
    );
    this.previewG = new px.Graphics();
    this.layers.preview.addChild(this.previewG);
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
  private readonly layers: Record<
    "paper" | "boxes" | "edges" | "preview" | "dots",
    InstanceType<Pixi["Container"]>
  >;
  private readonly previewG: InstanceType<Pixi["Graphics"]>;
  private geo: Geometry | null = null;
  private session: GameSession | null = null;
  private edgeG = new Map<number, InstanceType<Pixi["Graphics"]>>();
  private boxG = new Map<number, InstanceType<Pixi["Container"]>>();
  private previewEdge: number | null = null;
  private interactive = true;
  private destroyed = false;

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
    const pad = size * 0.09;
    const cell = (size - pad * 2) / Math.max(rows, cols);
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

  private drawPaper() {
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

  private drawDots() {
    const g = this.geo!;
    const dots = this.layers.dots;
    dots.removeChildren();
    const gfx = new this.px.Graphics();
    const r = Math.max(2.5, g.cell * 0.085);
    for (let i = 0; i <= g.rows; i++) {
      for (let j = 0; j <= g.cols; j++) {
        const p = this.dot(i, j);
        gfx.circle(p.x, p.y, r);
      }
    }
    gfx.fill(this.colors.ink);
    dots.addChild(gfx);
  }

  // ---------- Cạnh & ô ----------

  private resetBoard() {
    this.layers.edges.removeChildren();
    this.layers.boxes.removeChildren();
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
      if (owner === -1 || this.edgeG.has(e)) continue;
      const isLast = lastMove?.edge === e;
      this.addEdge(e, owner, animate && isLast);
    }
    for (let b = 0; b < state.owners.length; b++) {
      const owner = state.owners[b];
      if (owner === -1 || this.boxG.has(b)) continue;
      const isLast = lastMove?.captured.includes(b) ?? false;
      this.addBox(b, owner, animate && isLast);
    }
  }

  /** Điểm trên nét vẽ với độ run tay ổn định theo id cạnh. */
  private strokePoints(edge: number): { x: number; y: number }[] {
    const g = this.geo!;
    const [a, b] = edgeEndpoints(g.rows, g.cols, edge);
    const p0 = this.dot(a.r, a.c);
    const p1 = this.dot(b.r, b.c);
    const n = 6;
    const amp = g.cell * 0.03;
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

  private drawStroke(
    gfx: InstanceType<Pixi["Graphics"]>,
    edge: number,
    color: number,
    progress: number,
    alpha = 1,
  ) {
    const pts = this.strokePoints(edge);
    const g = this.geo!;
    gfx.clear();
    const total = pts.length - 1;
    const upto = total * Math.min(1, Math.max(0, progress));
    const full = Math.floor(upto);
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= full; i++) gfx.lineTo(pts[i].x, pts[i].y);
    if (full < total) {
      const t = upto - full;
      const a = pts[full];
      const b = pts[full + 1];
      gfx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    gfx.stroke({ width: Math.max(3, g.cell * 0.09), color, alpha, cap: "round", join: "round" });
  }

  private addEdge(edge: number, owner: Player, animate: boolean) {
    const gfx = new this.px.Graphics();
    this.layers.edges.addChild(gfx);
    this.edgeG.set(edge, gfx);
    const color = this.colors.pens[owner];
    if (!animate) {
      this.drawStroke(gfx, edge, color, 1);
      return;
    }
    const tween = { p: 0 };
    this.gsap.to(tween, {
      p: 1,
      duration: 0.18,
      ease: "power2.out",
      onUpdate: () => !this.destroyed && this.drawStroke(gfx, edge, color, tween.p),
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
    const gfx = new this.px.Graphics();
    // Tô nhạt + gạch chéo như bút tô vội.
    gfx.roundRect(-size / 2, -size / 2, size, size, size * 0.12).fill({ color, alpha: 0.22 });
    const step = size / 4;
    for (let i = -size; i < size; i += step) {
      gfx
        .moveTo(Math.max(-size / 2, i), Math.max(-size / 2, -i - size))
        .lineTo(Math.min(size / 2, i + size), Math.min(size / 2, -i));
    }
    gfx.stroke({ width: Math.max(1.5, g.cell * 0.035), color, alpha: 0.55, cap: "round" });
    container.addChild(gfx);
    this.layers.boxes.addChild(container);
    this.boxG.set(box, container);
    if (animate) {
      container.alpha = 0;
      container.scale.set(0.6);
      this.gsap.to(container, { alpha: 1, duration: 0.2 });
      this.gsap.to(container.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(2)" });
    }
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
    return null;
  }

  private setPreview(edge: number | null) {
    if (this.previewEdge === edge) return;
    this.previewEdge = edge;
    this.previewG.clear();
    if (edge === null || !this.session) return;
    this.drawStroke(this.previewG, edge, this.colors.pens[this.session.human], 1, 0.35);
    this.host.style.cursor = "pointer";
  }
}
