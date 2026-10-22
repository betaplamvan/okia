/**
 * BoardRenderer — vẽ bàn đấu bằng PixiJS v8 theo phong cách "giấy kem + nét bút" (docs/14),
 * bắt cạnh gần điểm chạm nhất (docs/11: không vùng chết), animation nét vẽ / ăn ô bằng GSAP.
 *
 * Chỉ chạy ở trình duyệt: pixi.js và gsap được import động trong `create()`.
 */
import type { GameResult, GameSession } from "../controller";
import { edgeCount, edgeEndpoints, horizontalEdgeCount, VOID, type Player } from "../rules";
import {
  assetUrl,
  penForm,
  seatSkins,
  skinAssetUrls,
  type BoxSkin,
  type Particles,
  type PenForm,
  type PenSkin,
  type PenStyle,
  type SeatSkins,
} from "../skins/skins";

type Pixi = typeof import("pixi.js");
type Gsap = typeof import("gsap").gsap;
type Graphics = InstanceType<Pixi["Graphics"]>;
type Container = InstanceType<Pixi["Container"]>;
type Texture = InstanceType<Pixi["Texture"]>;

/** Hình thái màu của bút đã đổi hex → số để vẽ nhanh (docs/08 — "forms"). */
interface RForm {
  color: number;
  color2: number;
  colors: number[];
  glow: number;
  core: number;
  accent: number;
  /** Màu sáng nhất trong hình thái — vệt ánh kim (metal). */
  bright: number;
}

/** Ba lớp Graphics của một nét: dưới (quầng / halo / viền đậm), chính, trên (lõi sáng / hạt / ánh kim). */
interface StrokeLayers {
  c: Container;
  under: Graphics;
  main: Graphics;
  over: Graphics;
}

/** Một cạnh đã vẽ cùng dữ liệu để animate theo kiểu bút. */
interface EdgePiece extends StrokeLayers {
  edge: number;
  owner: Player;
  pen: PenSkin;
  form: RForm;
  /** Thời điểm vẽ (performance.now, ms) — pha của quầng thở / ánh kim. */
  born: number;
  /** Mốc sớm nhất được vẽ lại (ms): cầu vồng trôi / ánh kim chỉ vẽ lại mỗi ~50 ms. */
  next: number;
  /** Tiến độ nét đang chạy (0–1) để lần vẽ lại từ ticker không "nhảy" tới nét đầy. */
  progress: number;
  /** Đang hiện vệt ánh kim (để xóa khi hết). */
  shimmering: boolean;
}

/** Tham số tức thời khi vẽ nét (không có = tĩnh). */
interface StrokeAnim {
  /** Độ lệch gradient cầu vồng 0–1 (trôi dọc nét). */
  flow?: number;
  /** Hệ số bề rộng halo mực loang (bút lông: nở 1 → 2.2). */
  haloScale?: number;
}

/** Hạt lửa / tàn lửa của bút lửa: Graphics tái dùng (pool), chỉ đổi vị trí, scale, alpha, tint mỗi khung. */
interface Flame {
  g: Graphics;
  ember: boolean;
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  sway: number;
  rise: number;
  color: number;
  color2: number;
}

/** Ngữ cảnh dựng hình ô đã ăn (tọa độ cục bộ trong `inner`: gốc = tâm ô). */
interface BoxCtx {
  box: number;
  inner: Container;
  form: RForm;
  /** Màu chính của hình thái bút người ăn. */
  color: number;
  /** Cạnh hình (≈ 76 % ô) và nửa cạnh. */
  size: number;
  h: number;
  cell: number;
  /** `box.alpha` của manifest. */
  alpha: number;
  thin: number;
  /** Tâm ô trong tọa độ bàn (cho hạt lửa). */
  x: number;
  y: number;
}

/** Kết quả builder ô: animation hiện (bỏ qua khi giảm hiệu ứng) + hook sống chạy trên ticker. */
interface BoxBuilt {
  animate: () => void;
  live?: (now: number, dt: number) => void;
}

/** Một ô đã ăn: `c` giữ vị trí (đếm ô scale `c`), `inner` chứa hình (animation / lay / rung riêng). */
interface BoxPiece {
  box: number;
  c: Container;
  inner: Container;
  born: number;
  live?: (now: number, dt: number) => void;
}

/** Trần vật thể sống của ô (than hồng + khói, 3 / ô): bàn 7×7 đầy = 147. */
const BOX_LIVE_CAP = 150;

/** Kiểu bút có hiệu ứng chạy liên tục (ticker). Giảm hiệu ứng → tĩnh hết. */
const ANIMATED_STYLES = new Set<PenStyle>(["neon", "rainbow", "metal", "fire"]);
/** Trần số hạt lửa sống trên một bàn. */
const FLAME_CAP = 60;

export interface RendererColors {
  paper: number;
  paperShadow: number;
  grid: number;
  ink: number;
  /** Màu ghế mặc định — chỉ còn là dự phòng; màu nét thật lấy từ hình thái bút (penFor). */
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
    this.preview = this.makeLayers(this.layers.preview);
    this.fontFamily = opts.fontFamily || getComputedStyle(host).fontFamily || "sans-serif";
    this.bindPointer();
    app.renderer.on("resize", () => this.layout());
    // Hiệu ứng chạy liên tục theo kiểu bút (quầng thở, cầu vồng trôi, ánh kim, lửa) — bỏ khi giảm hiệu ứng.
    if (!opts.reducedMotion) app.ticker.add(this.tick);
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
  private readonly preview: StrokeLayers;
  private readonly fontFamily: string;
  private geo: Geometry | null = null;
  private session: GameSession | null = null;
  private edgeG = new Map<number, EdgePiece>();
  private boxG = new Map<number, BoxPiece>();
  /** Ô có hiệu ứng sống (sáp lấp lánh, hoa lay, than hồng) và số vật thể sống của ô đang có. */
  private liveBoxes: BoxPiece[] = [];
  private boxLive = 0;
  /** Cạnh có hiệu ứng chạy liên tục; `fires` / `golds` là tập con để sinh lửa / sao lấp lánh. */
  private animated = new Set<EdgePiece>();
  private fires: EdgePiece[] = [];
  private golds: EdgePiece[] = [];
  private flames: Flame[] = [];
  private flamePool: Graphics[] = [];
  private emberPool: Graphics[] = [];
  private spawnAcc = 0;
  /** Lượt nạp ảnh gói skin gần nhất (bỏ kết quả cũ khi đổi skin giữa chừng). */
  private assetGen = 0;
  private readonly formCache = new WeakMap<PenForm, RForm>();
  private readonly tick = () => this.onTick();
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
    // Đổi ghế (vào phòng với ghế khác) → hình thái mình/đối thủ đổi → vẽ lại.
    const seatChanged = !!prev && prev.human !== session.human;
    if (sizeChanged || restarted || seatChanged) {
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
    void this.loadAssets();
  }

  /**
   * Ảnh của gói skin (ADR-0014: hình ô, vụn, ảnh lặp nét) nạp qua Assets rồi vẽ lại; trước khi
   * nạp xong, ô / nét dùng hình dự phòng (gạch chéo, nét trơn). Ảnh lỗi → giữ dự phòng.
   */
  private async loadAssets() {
    const urls = [...this.skins.pens, ...this.skins.boxes].flatMap((s) => skinAssetUrls(s).images);
    const missing = [...new Set(urls)].filter((u) => !this.px.Assets.cache.has(u));
    if (missing.length === 0) return;
    const gen = ++this.assetGen;
    await Promise.all(
      missing.map((u) =>
        this.px.Assets.load<Texture>({
          src: u,
          alias: u,
          data: { resolution: u.endsWith(".svg") ? 2 : 1 },
        })
          .then((t) => {
            t.source.addressMode = "repeat"; // ảnh lặp dọc nét
          })
          .catch(() => undefined),
      ),
    );
    if (this.destroyed || gen !== this.assetGen) return;
    if (this.session && this.geo) this.redrawAllPieces();
  }

  /** Ảnh đã nạp theo URL (null = không có / chưa nạp / lỗi). */
  private texture(url: string | null): Texture | null {
    return url && this.px.Assets.cache.has(url) ? this.px.Assets.get<Texture>(url) : null;
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
    this.app.ticker.remove(this.tick);
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
    this.clearFlames();
    this.layers.fx.removeChildren();
    this.layers.edges.removeChildren();
    this.layers.boxes.removeChildren();
    this.layers.marks.removeChildren();
    this.marksKey = "";
    this.edgeG.clear();
    this.animated.clear();
    this.fires.length = 0;
    this.golds.length = 0;
    this.boxG.clear();
    this.liveBoxes.length = 0;
    this.boxLive = 0;
    this.previewEdge = null;
    this.preview.under.clear();
    this.preview.main.clear();
    this.preview.over.clear();
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

  // ---------- Bút: hình thái & nét (docs/08 — forms, pen.style) ----------

  /** Hình thái màu đã đổi sang số; cache theo object form của manifest. */
  private resolve(f: PenForm): RForm {
    let r = this.formCache.get(f);
    if (r) return r;
    const color = parseHex(f.color);
    const color2 = f.color2 ? parseHex(f.color2) : color;
    const colors = f.colors ? f.colors.map(parseHex) : [color, color2];
    const glow = f.glow ? parseHex(f.glow) : color;
    const core = f.core ? parseHex(f.core) : f.color2 ? color2 : 0xffffff;
    const all = [color, color2, glow, core, ...colors];
    r = {
      color,
      color2,
      colors,
      glow,
      core,
      accent: f.accent ? parseHex(f.accent) : blend(color, this.colors.ink, 0.35),
      bright: all.reduce((a, b) => (luma(b) > luma(a) ? b : a)),
    };
    this.formCache.set(f, r);
    return r;
  }

  /**
   * Bút và hình thái của một ghế theo phía nhìn: ghế của mình (`session.human`) dùng hình thái
   * `mine` (tông lạnh), ghế kia `opponent` (tông nóng) — hai bên đều thấy nét mình lạnh, đối thủ nóng.
   */
  private penFor(owner: Player): { pen: PenSkin; form: RForm } {
    const pen = this.skins.pens[owner];
    const mine = owner === (this.session?.human ?? 0);
    return { pen, form: this.resolve(penForm(pen, mine)) };
  }

  /** Màu chính của bút ghế `owner` (ô đã ăn, chữ đếm ô, vụn). */
  private penColor(owner: Player): number {
    return this.penFor(owner).form.color;
  }

  private makeLayers(parent: Container): StrokeLayers {
    const c = new this.px.Container();
    const under = new this.px.Graphics();
    const main = new this.px.Graphics();
    const over = new this.px.Graphics();
    c.addChild(under, main, over);
    parent.addChild(c);
    return { c, under, main, over };
  }

  /**
   * Vẽ một nét (toàn bộ hoặc tới `progress`) theo kiểu bút và hình thái màu:
   * - lớp dưới: quầng neon / kim loại, halo mực loang (brush), bụi phấn, viền đậm (twotone);
   * - lớp chính: nét phẳng, nét đứt, thanh đậm, hoặc gradient dọc nét (PixiJS không có gradient
   *   cho stroke → vẽ từng đoạn con, mỗi đoạn một màu nội suy; cầu vồng / kim loại nhiều mốc);
   * - lớp trên: lõi sáng (neon, lửa), vệt chì / chấm sáp.
   */
  private drawStroke(
    L: StrokeLayers,
    edge: number,
    progress: number,
    alpha: number,
    pen: PenSkin,
    form: RForm,
    anim: StrokeAnim = {},
  ) {
    const g = this.geo!;
    const p = pen.pen;
    const style = p.style;
    const graded =
      style === "gradient" || style === "brush" || style === "rainbow" || style === "metal";
    const n = graded || p.dash || p.taper ? (style === "rainbow" ? 12 : 24) : 6;
    const pts = this.strokePoints(edge, p.jitter ?? 1, n);
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
    const width = Math.max(3, g.cell * 0.09) * p.width;
    const cap = p.cap ?? "round";
    const a = alpha * (p.alpha ?? 1);
    const { under, main, over } = L;
    under.clear();
    main.clear();
    over.clear();
    under.alpha = style === "neon" ? 0.35 * alpha : 1;
    if (poly.length < 2) return;
    const line = (gfx: Graphics) => {
      gfx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) gfx.lineTo(poly[i].x, poly[i].y);
      return gfx;
    };
    const join = "round" as const;
    // Ảnh lặp của gói skin (ADR-0014): lớp phủ trên nét, vùng đục nhuộm `color2`, vùng trong suốt
    // để lộ màu nét; chưa nạp → nét trơn.
    const tex = p.texture ? this.texture(assetUrl(pen, p.texture)) : null;

    // --- Lớp dưới. Quầng neon vẽ alpha 1 rồi "thở" bằng under.alpha (không vẽ lại mỗi khung).
    switch (style) {
      case "neon":
        line(under).stroke({ width: width * 2.6, color: form.glow, cap, join });
        break;
      case "metal":
        line(under).stroke({ width: width * 2, color: form.glow, alpha: 0.3 * alpha, cap, join });
        break;
      case "fire":
        line(under).stroke({
          width: width * 2.2,
          color: form.color,
          alpha: 0.22 * alpha,
          cap,
          join,
        });
        break;
      case "twotone":
        line(under).stroke({
          width: width * 1.6,
          color: form.color2,
          alpha: 0.55 * alpha,
          cap,
          join,
        });
        break;
      case "brush":
        line(under).stroke({
          width: width * (anim.haloScale ?? 2.2),
          color: form.color2,
          alpha: 0.22 * alpha,
          cap: "round",
          join,
        });
        break;
      case "gradient":
        if (p.halo) {
          line(under).stroke({
            width: width * 2.4,
            color: form.color2,
            alpha: 0.18 * alpha,
            cap: "round",
            join,
          });
        }
        break;
    }

    // --- Lớp chính.
    const flow = anim.flow ?? 0;
    const colorAt = (t: number): number => {
      if (style === "rainbow") return gradientAt(form.colors, t - flow, true);
      if (style === "metal") return gradientAt(form.colors, t, false);
      if (graded) return blend(form.color, form.color2, t);
      return form.color;
    };
    const widthAt = (t: number): number => {
      // Bút lông: thanh đậm mạnh 0.4× → 1.5×; thanh đậm thường 0.45× → 1.2×.
      if (style === "brush") return width * (0.4 + 1.1 * Math.sin(Math.PI * t));
      if (p.taper) return width * (0.45 + 0.75 * Math.sin(Math.PI * t));
      return width;
    };
    if (graded || p.taper) {
      // Từng đoạn con: màu / bề dày nội suy theo vị trí; nét đứt bỏ đoạn rơi vào phần hở.
      const [on, off] = p.dash ?? [1, 0];
      const period = (on + off) * g.cell;
      let dist = 0;
      for (let i = 1; i < poly.length; i++) {
        const phase = (dist % period) / g.cell;
        dist += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
        if (p.dash && phase >= on * 0.98) continue;
        const t = (i - 0.5) / total;
        main.moveTo(poly[i - 1].x, poly[i - 1].y).lineTo(poly[i].x, poly[i].y);
        main.stroke({
          width: widthAt(t),
          color: colorAt(t),
          alpha: a,
          cap: p.dash ? cap : "round",
          join,
        });
      }
    } else if (p.dash) {
      // Nét đứt: lặp [vẽ, hở] theo tỷ lệ ô; vẽ các đoạn con nằm trong phần "vẽ".
      const [on, off] = p.dash;
      const period = (on + off) * g.cell;
      let dist = 0;
      for (let i = 1; i < poly.length; i++) {
        const phase = (dist % period) / g.cell;
        dist += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
        if (phase < on * 0.98)
          main.moveTo(poly[i - 1].x, poly[i - 1].y).lineTo(poly[i].x, poly[i].y);
      }
      main.stroke({ width, color: form.color, alpha: a, cap, join });
    } else {
      line(main).stroke({ width, color: form.color, alpha: a, cap, join });
    }
    if (tex) {
      const ts = p.textureScale ?? 1;
      line(over).stroke({
        width: width * (p.taper || style === "brush" ? 0.9 : 1),
        texture: tex,
        matrix: new this.px.Matrix().scale(ts, ts),
        textureSpace: "global",
        color: form.color2,
        alpha: 0.95 * a,
        cap,
        join,
      });
    }

    // --- Lớp trên.
    if (style === "neon" || style === "fire") {
      // Lõi sáng mảnh giữa nét.
      line(over).stroke({
        width: Math.max(1, width * (style === "neon" ? 0.35 : 0.4)),
        color: form.core,
        alpha: (style === "neon" ? 0.9 : 0.85) * alpha,
        cap: style === "neon" ? cap : "round",
        join,
      });
    }
    if (p.grain === "graphite") {
      // Vệt chì phụ mảnh, lệch sang một bên nét.
      const dx = pts[total].x - pts[0].x;
      const dy = pts[total].y - pts[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * width * 0.28;
      const oy = (dx / len) * width * 0.28;
      over.moveTo(poly[0].x + ox, poly[0].y + oy);
      for (let i = 1; i < poly.length; i++) over.lineTo(poly[i].x + ox, poly[i].y + oy);
      over.stroke({
        width: Math.max(1, width * 0.3),
        color: form.color2,
        alpha: 0.5 * alpha,
        cap: "round",
        join,
      });
    } else if (p.grain === "wax") {
      // Chấm sáp sẫm rải tất định dọc nét (hash theo cạnh), chỉ trong phần đã vẽ.
      const dots = 9;
      const dx = pts[total].x - pts[0].x;
      const dy = pts[total].y - pts[0].y;
      const len = Math.hypot(dx, dy) || 1;
      for (let k = 0; k < dots; k++) {
        const t = (k + 0.5) / dots;
        if (t > progress) break;
        const h1 = hash01(edge * 31 + k);
        const h2 = hash01(edge * 17 + k * 7 + 3);
        const q = pointAt(pts, t);
        const off = (h1 - 0.5) * width * 0.7;
        over.circle(q.x + (-dy / len) * off, q.y + (dx / len) * off, width * (0.1 + 0.1 * h2));
      }
      over.fill({ color: form.accent, alpha: 0.65 * alpha });
    }
  }

  /** Vệt ánh kim (bút vàng): đoạn sáng ngắn tại vị trí `s` (0–1) dọc nét; `null` = xóa. */
  private drawShimmer(piece: EdgePiece, s: number | null) {
    piece.over.clear();
    piece.shimmering = s !== null;
    if (s === null) return;
    const g = this.geo!;
    const p = piece.pen.pen;
    const width = Math.max(3, g.cell * 0.09) * p.width;
    const pts = this.strokePoints(piece.edge, p.jitter ?? 1, 24);
    const total = pts.length - 1;
    const from = Math.max(0, Math.floor((s - 0.1) * total));
    const to = Math.min(total, Math.ceil((s + 0.1) * total));
    if (to - from < 1) return;
    const seg = (gfx: Graphics) => {
      gfx.moveTo(pts[from].x, pts[from].y);
      for (let i = from + 1; i <= to; i++) gfx.lineTo(pts[i].x, pts[i].y);
      return gfx;
    };
    seg(piece.over).stroke({
      width: width * 1.1,
      color: piece.form.bright,
      alpha: 0.45,
      cap: "round",
    });
    seg(piece.over).stroke({ width: width * 0.55, color: 0xffffff, alpha: 0.85, cap: "round" });
  }

  private addEdge(edge: number, owner: Player, animate: boolean) {
    const { pen, form } = this.penFor(owner);
    const piece: EdgePiece = {
      ...this.makeLayers(this.layers.edges),
      edge,
      owner,
      pen,
      form,
      born: performance.now(),
      next: 0,
      progress: 1,
      shimmering: false,
    };
    this.edgeG.set(edge, piece);
    const style = pen.pen.style;
    if (!this.opts.reducedMotion && ANIMATED_STYLES.has(style)) {
      this.animated.add(piece);
      if (style === "fire") this.fires.push(piece);
      if (style === "metal") this.golds.push(piece);
    }
    if (!animate) {
      this.drawStroke(piece, edge, 1, 1, pen, form);
      return;
    }
    const brush = style === "brush";
    const tween = { p: 0 };
    piece.progress = 0;
    this.gsap.to(tween, {
      p: 1,
      duration: 0.18,
      ease: "power2.out",
      onUpdate: () => {
        if (this.destroyed) return;
        piece.progress = tween.p;
        this.drawStroke(piece, edge, tween.p, 1, pen, form, brush ? { haloScale: 1 } : {});
      },
      onComplete: () => {
        if (this.destroyed || !brush || this.edgeG.get(edge) !== piece) return;
        // Mực loang: halo nở từ ×1 ra ×2.2 trong 0.6 s sau khi nét vẽ xong.
        const h = { s: 1 };
        this.gsap.to(h, {
          s: 2.2,
          duration: 0.6,
          ease: "power2.out",
          onUpdate: () => {
            if (this.destroyed || this.edgeG.get(edge) !== piece) return;
            this.drawStroke(piece, edge, 1, 1, pen, form, { haloScale: h.s });
          },
        });
      },
    });
  }

  // ---------- Hiệu ứng chạy liên tục (ticker) ----------

  /**
   * Mỗi khung: hiệu ứng sống của ô (sáp lấp lánh, hoa lay, than hồng / khói — chỉ đổi thuộc tính),
   * quầng neon thở (chỉ đổi alpha), cầu vồng trôi (vẽ lại mỗi ~50 ms), ánh kim quét (vẽ lại lớp
   * trên mỗi ~50 ms trong lúc quét), lửa (hạt pool, không cấp phát mới), sao lấp lánh (hiếm).
   * Không chạy khi giảm hiệu ứng (ticker không được gắn).
   */
  private onTick() {
    if (this.destroyed || !this.geo) return;
    if (this.animated.size === 0 && this.flames.length === 0 && this.liveBoxes.length === 0) return;
    const now = performance.now();
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);
    for (const b of this.liveBoxes) b.live!(now, dt);
    for (const piece of this.animated) {
      switch (piece.pen.pen.style) {
        case "neon":
          // Quầng thở 0.25–0.45, chu kỳ 1.2 s.
          piece.under.alpha = 0.35 + 0.1 * Math.sin(((now - piece.born) / 1200) * Math.PI * 2);
          break;
        case "rainbow":
          if (now >= piece.next) {
            piece.next = now + 50;
            this.drawStroke(piece, piece.edge, piece.progress, 1, piece.pen, piece.form, {
              flow: (now / 2000) % 1,
            });
          }
          break;
        case "metal": {
          // Vệt sáng chạy dọc nét trong 0.5 s, mỗi 3 s; lệch pha theo cạnh để không đồng loạt.
          const phase = ((now - piece.born + hash01(piece.edge) * 3000) % 3000) / 3000;
          if (phase < 0.17) {
            if (now >= piece.next) {
              piece.next = now + 50;
              this.drawShimmer(piece, phase / 0.17);
            }
          } else if (piece.shimmering) this.drawShimmer(piece, null);
          break;
        }
      }
    }
    if (this.fires.length > 0) this.spawnFlames(dt);
    if (this.golds.length > 0 && Math.random() < dt * Math.min(1.5, this.golds.length * 0.25)) {
      this.twinkle();
    }
    this.updateFlames(dt);
  }

  /** Sinh lửa dọc các nét lửa: tốc độ tỷ lệ số cạnh nhưng chặn trần để bàn đầy không vượt FLAME_CAP. */
  private spawnFlames(dt: number) {
    const g = this.geo!;
    this.spawnAcc += Math.min(75, 12 * this.fires.length) * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.flames.length >= FLAME_CAP) {
        this.spawnAcc = 0;
        return;
      }
      const piece = this.fires[Math.floor(Math.random() * this.fires.length)];
      const [a, b] = edgeEndpoints(g.rows, g.cols, piece.edge);
      const p0 = this.dot(a.r, a.c);
      const p1 = this.dot(b.r, b.c);
      const t = 0.08 + Math.random() * 0.84 * piece.progress;
      this.pushFlame(
        p0.x + (p1.x - p0.x) * t + (Math.random() - 0.5) * g.cell * 0.05,
        p0.y + (p1.y - p0.y) * t,
        piece.form,
        Math.random() < 0.3,
        1,
      );
    }
  }

  /** Thêm một hạt lửa (`ember` = tàn lửa tròn nhỏ) tại (x, y); `boost` phóng to / bay cao hơn (bùng ô). */
  private pushFlame(x: number, y: number, form: RForm, ember: boolean, boost: number) {
    const g = this.geo!;
    const gfx = this.takeFlame(ember);
    gfx.position.set(x, y);
    gfx.alpha = 0;
    gfx.visible = true;
    this.flames.push({
      g: gfx,
      ember,
      x,
      y,
      age: 0,
      life: ember ? 0.7 + Math.random() * 0.5 : 0.45 + Math.random() * 0.35,
      size: g.cell * (ember ? 0.02 + Math.random() * 0.025 : 0.06 + Math.random() * 0.07) * boost,
      sway: (Math.random() - 0.5) * g.cell * 0.15 * boost,
      rise: g.cell * (ember ? 0.5 : 0.35) * (0.8 + Math.random() * 0.5) * boost,
      color: form.color,
      color2: form.color2,
    });
  }

  /** Lấy Graphics hạt lửa từ pool (vẽ hình trắng một lần, sau đó chỉ tint). */
  private takeFlame(ember: boolean): Graphics {
    const pool = ember ? this.emberPool : this.flamePool;
    const reused = pool.pop();
    if (reused) return reused;
    const gfx = new this.px.Graphics();
    if (ember) gfx.circle(0, 0, 1).fill(0xffffff);
    else {
      gfx
        .moveTo(0, -1)
        .bezierCurveTo(0.6, -0.3, 0.6, 0.35, 0, 0.55)
        .bezierCurveTo(-0.6, 0.35, -0.6, -0.3, 0, -1)
        .fill(0xffffff);
    }
    this.layers.fx.addChild(gfx);
    return gfx;
  }

  private updateFlames(dt: number) {
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.g.visible = false;
        (f.ember ? this.emberPool : this.flamePool).push(f.g);
        this.flames[i] = this.flames[this.flames.length - 1];
        this.flames.pop();
        continue;
      }
      f.g.x = f.x + f.sway * Math.sin(t * Math.PI * 2 + f.x);
      f.g.y = f.y - f.rise * t;
      const s = f.size * (1 - 0.55 * t);
      f.g.scale.set(s, f.ember ? s : s * 1.4);
      f.g.alpha = f.ember ? 0.9 * (1 - t) : 0.85 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      // Lõi sáng (color2) nguội dần về màu chính.
      f.g.tint = blend(f.color2, f.color, f.ember ? 0.2 : t * 0.9);
    }
  }

  /** Ô bùng cháy (bút lửa ăn ô) / combo lửa: chùm lửa to hơn bay lên từ (x, y). */
  private flameBurst(x: number, y: number, form: RForm, n: number) {
    if (this.opts.reducedMotion) return;
    const g = this.geo!;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * g.cell * 0.3;
      this.pushFlame(x + Math.cos(ang) * r, y + Math.sin(ang) * r, form, i % 3 === 2, 1.6);
    }
  }

  private clearFlames() {
    for (const f of this.flames) f.g.destroy();
    for (const gfx of this.flamePool) gfx.destroy();
    for (const gfx of this.emberPool) gfx.destroy();
    this.flames = [];
    this.flamePool = [];
    this.emberPool = [];
    this.spawnAcc = 0;
  }

  /** Sao nhỏ lóe lên tại một điểm ngẫu nhiên trên một nét vàng (hiếm). */
  private twinkle() {
    const g = this.geo!;
    const piece = this.golds[Math.floor(Math.random() * this.golds.length)];
    const [a, b] = edgeEndpoints(g.rows, g.cols, piece.edge);
    const p0 = this.dot(a.r, a.c);
    const p1 = this.dot(b.r, b.c);
    const t = 0.1 + Math.random() * 0.8;
    const star = new this.px.Graphics();
    const r = g.cell * 0.09;
    star.star(0, 0, 4, r, r * 0.35).fill(0xffffff);
    star.tint = piece.form.bright;
    star.position.set(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
    star.scale.set(0);
    this.layers.fx.addChild(star);
    this.gsap
      .timeline({ onComplete: () => !this.destroyed && star.destroy() })
      .to(star.scale, { x: 1, y: 1, duration: 0.22, ease: "power2.out" })
      .to(star, { rotation: 0.8, duration: 0.5 }, 0)
      .to(star.scale, { x: 0, y: 0, duration: 0.28, ease: "power2.in" });
  }

  // ---------- Ô đã ăn (docs/08 — skin ô: hình + animation hiện + hiệu ứng sống) ----------

  private addBox(box: number, owner: Player, animate: boolean) {
    const g = this.geo!;
    const { pen, form } = this.penFor(owner);
    const skin = this.skins.boxes[owner];
    const center = this.boxCenter(box);
    // `c` giữ vị trí (đếm ô cuối ván scale `c`); `inner` chứa hình để animation / lay / rung riêng.
    const c = new this.px.Container();
    c.position.set(center.x, center.y);
    const inner = new this.px.Container();
    c.addChild(inner);
    const inset = g.cell * 0.12;
    const size = g.cell - inset * 2;
    const ctx: BoxCtx = {
      box,
      inner,
      form,
      color: form.color,
      size,
      h: size / 2,
      cell: g.cell,
      alpha: skin.box.alpha,
      thin: Math.max(1.5, g.cell * 0.035),
      x: center.x,
      y: center.y,
    };
    const built = this.buildBox(skin, ctx);
    this.layers.boxes.addChild(c);
    const piece: BoxPiece = { box, c, inner, born: performance.now(), live: built.live };
    this.boxG.set(box, piece);
    if (piece.live && !this.opts.reducedMotion) this.liveBoxes.push(piece);
    if (!animate) return;
    built.animate();
    this.burst(
      center.x,
      center.y,
      form.color,
      skin.box.particles,
      10,
      1,
      this.texture(assetUrl(skin, skin.box.particleImage)),
    );
    // Bút lửa: ô bùng cháy.
    if (pen.pen.style === "fire") this.flameBurst(center.x, center.y, form, 9);
  }

  /** Mỗi hiệu ứng một builder: vẽ hình cuối vào `ctx.inner`, trả về animation hiện và hook sống. */
  private buildBox(skin: BoxSkin, ctx: BoxCtx): BoxBuilt {
    switch (skin.box.effect) {
      case "fill":
        return this.boxFill(ctx);
      case "crosshatch":
        return this.boxHatch(ctx, true);
      case "dots":
        return this.boxDots(ctx);
      case "scribble":
        return this.boxScribble(ctx);
      case "star":
        return this.boxStar(ctx);
      case "stamp":
        return this.boxStamp(ctx);
      case "heart":
        return this.boxHeart(ctx);
      case "seal":
        return this.boxSeal(ctx);
      case "flower":
        return this.boxFlower(ctx);
      case "flame":
        return this.boxFlame(ctx);
      case "image":
        return this.boxImage(skin, ctx);
      case "hatch":
      default:
        return this.boxHatch(ctx, false);
    }
  }

  /**
   * Ảnh của gói skin in vào ô (ADR-0014): vừa khung `scale` × ô, nhuộm màu bút người ăn trừ khi
   * `tint: false`, nghiêng nhẹ tất định theo ô; hiện bằng cú đập như con dấu. Chưa nạp ảnh → gạch
   * chéo, vẽ lại khi nạp xong (loadAssets).
   */
  private boxImage(skin: BoxSkin, ctx: BoxCtx): BoxBuilt {
    const tex = this.texture(assetUrl(skin, skin.box.image));
    if (!tex) return this.boxHatch(ctx, false);
    const { inner, box, color, size, alpha } = ctx;
    const sp = new this.px.Sprite(tex);
    sp.anchor.set(0.5);
    const k = (size * (skin.box.scale ?? 0.9)) / Math.max(tex.width, tex.height);
    sp.scale.set(k);
    if (skin.box.tint !== false) sp.tint = color;
    sp.alpha = alpha;
    sp.rotation = ((hash01(box * 7 + 1) * 2 - 1) * 6 * Math.PI) / 180;
    inner.addChild(sp);
    return {
      animate: () => {
        sp.alpha = 0;
        sp.scale.set(k * 1.5);
        this.gsap.to(sp, { alpha, duration: 0.1 });
        this.gsap.to(sp.scale, { x: k, y: k, duration: 0.28, ease: "back.out(2)" });
      },
    };
  }

  /**
   * Ba nét gạch chéo (offset −h/2, 0, +h/2) cắt trong ô vuông cạnh 2h; `dir` 1 = xuôi (dưới-trái →
   * trên-phải), −1 = ngược. `progress` 0–1 vẽ lần lượt từng nét (nét đang vẽ chỉ tới một phần).
   */
  private hatchLines(gfx: Graphics, h: number, dir: 1 | -1, progress: number) {
    const offs = [-h / 2, 0, h / 2];
    for (let k = 0; k < offs.length; k++) {
      const p = Math.min(1, Math.max(0, progress * offs.length - k));
      if (p <= 0) break;
      const c = offs[k] * 2; // đường x + y = c
      const a = c >= 0 ? { x: c - h, y: h } : { x: -h, y: c + h };
      const b = c >= 0 ? { x: h, y: c - h } : { x: c + h, y: -h };
      if (dir === -1) {
        a.x = -a.x;
        b.x = -b.x;
      }
      gfx.moveTo(a.x, a.y).lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
    }
  }

  /** Gạch chéo / gạch ca-rô: nền tô nhạt rồi các nét vẽ lần lượt (ca-rô: xuôi trước, ngược sau). */
  private boxHatch(ctx: BoxCtx, cross: boolean): BoxBuilt {
    const { inner, color, size, h, alpha, thin } = ctx;
    const bg = new this.px.Graphics();
    bg.roundRect(-h, -h, size, size, size * 0.12).fill({ color, alpha });
    const lines = new this.px.Graphics();
    const draw = (p1: number, p2: number) => {
      lines.clear();
      this.hatchLines(lines, h, 1, p1);
      if (cross) this.hatchLines(lines, h, -1, p2);
      lines.stroke({ width: thin, color, alpha: 0.55, cap: "round" });
    };
    inner.addChild(bg, lines);
    draw(1, 1);
    return {
      animate: () => {
        const dur = cross ? 0.35 : 0.25;
        bg.alpha = 0;
        this.gsap.to(bg, { alpha: 1, duration: cross ? dur : 0.1 });
        const tw = { p: 0 };
        this.gsap.to(tw, {
          p: 1,
          duration: dur,
          ease: "none",
          onUpdate: () => {
            if (this.destroyed) return;
            if (cross) draw(Math.min(1, tw.p * 2), Math.max(0, tw.p * 2 - 1));
            else draw(tw.p, 0);
          },
        });
      },
    };
  }

  /** Tô kín: tứ giác hơi lệch + vệt tô lòi mép; hiện bằng mask quét chéo từ góc trên trái (0,3 s). */
  private boxFill(ctx: BoxCtx): BoxBuilt {
    const { inner, box, color, size, h, alpha } = ctx;
    const j = (k: number) => (hash01(box * 13 + k) - 0.5) * size * 0.08;
    const gfx = new this.px.Graphics();
    gfx
      .poly([-h + j(1), -h + j(2), h + j(3), -h + j(4), h + j(5), h + j(6), -h + j(7), h + j(8)])
      .fill({ color, alpha });
    // Vệt tô thừa: nhát bút rộng quá tay, lòi khỏi mép phải / trái một chút.
    for (let k = 0; k < 3; k++) {
      const y = -h + size * (0.18 + 0.3 * k) + j(9 + k);
      const right = k % 2 === 0;
      gfx
        .rect(right ? h - size * 0.14 : -h - size * 0.1, y, size * 0.24, size * 0.1)
        .fill({ color, alpha: alpha * 0.7 });
    }
    inner.addChild(gfx);
    return {
      animate: () => {
        const H = h * 1.4;
        const m = new this.px.Graphics();
        inner.addChild(m);
        gfx.mask = m;
        const tw = { p: 0 };
        this.gsap.to(tw, {
          p: 1,
          duration: 0.3,
          ease: "power1.inOut",
          onUpdate: () => {
            if (this.destroyed) return;
            const d = tw.p * H * 4;
            m.clear()
              .poly([-H, -H, -H + d, -H, -H, -H + d])
              .fill(0xffffff);
          },
          onComplete: () => {
            if (this.destroyed) return;
            gfx.mask = null;
            m.destroy();
          },
        });
      },
    };
  }

  /** Chấm bi: 3×3 (ô nhỏ: 2×2 chấm to), chấm giữa to hơn, nảy lên lần lượt theo xoắn ốc từ giữa ra. */
  private boxDots(ctx: BoxCtx): BoxBuilt {
    const { inner, color, size, h, alpha, cell } = ctx;
    const bg = new this.px.Graphics();
    bg.roundRect(-h, -h, size, size, size * 0.12).fill({ color, alpha: alpha * 0.5 });
    inner.addChild(bg);
    const small = cell < 44;
    const n = small ? 2 : 3;
    const dots: { d: Graphics; key: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const x = small ? -h + size * (0.3 + i * 0.4) : -h + size * (0.2 + i * 0.3);
        const y = small ? -h + size * (0.3 + k * 0.4) : -h + size * (0.2 + k * 0.3);
        const center = !small && i === 1 && k === 1;
        const r = size * (small ? 0.13 : 0.09) * (center ? 1.35 : 1);
        const d = new this.px.Graphics();
        d.circle(0, 0, r).fill({ color, alpha: 0.7 });
        d.position.set(x, y);
        inner.addChild(d);
        // Thứ tự xoắn ốc: gần tâm trước, cùng vòng thì theo góc.
        const ang = (Math.atan2(y, x) + Math.PI * 2.5) % (Math.PI * 2);
        dots.push({ d, key: Math.round(Math.hypot(x, y) / size) * 10 + ang });
      }
    }
    dots.sort((a, b) => a.key - b.key);
    return {
      animate: () => {
        bg.alpha = 0;
        this.gsap.to(bg, { alpha: 1, duration: 0.15 });
        dots.forEach(({ d }, k) => {
          d.scale.set(0);
          this.gsap.to(d.scale, {
            x: 1,
            y: 1,
            duration: 0.25,
            delay: k * 0.04,
            ease: "back.out(2.5)",
          });
        });
      },
    };
  }

  /** Nguệch ngoạc: zigzag tất định vẽ dần theo đường với chấm đầu bút đi trước; xong thì ô rung 2 px. */
  private boxScribble(ctx: BoxCtx): BoxBuilt {
    const { inner, box, color, h, alpha, thin } = ctx;
    let seed = box * 7919 + 13;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pts = [{ x: -h * 0.8, y: -h * 0.7 }];
    for (let i = 0; i < 9; i++)
      pts.push({ x: (rnd() * 2 - 1) * h * 0.85, y: (rnd() * 2 - 1) * h * 0.85 });
    const line = new this.px.Graphics();
    const tip = new this.px.Graphics();
    tip.circle(0, 0, thin * 1.2).fill({ color, alpha: 0.9 });
    tip.visible = false;
    inner.addChild(line, tip);
    const draw = (p: number) => {
      line.clear();
      const total = pts.length - 1;
      const upto = total * Math.min(1, Math.max(0, p));
      const full = Math.floor(upto);
      line.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= full; i++) line.lineTo(pts[i].x, pts[i].y);
      let end = pts[Math.min(total, full)];
      if (full < total) {
        const t = upto - full;
        const a = pts[full];
        const b = pts[full + 1];
        end = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        line.lineTo(end.x, end.y);
      }
      line.stroke({ width: thin * 2.2, color, alpha, cap: "round", join: "round" });
      tip.position.set(end.x, end.y);
    };
    draw(1);
    return {
      animate: () => {
        tip.visible = true;
        const tw = { p: 0 };
        this.gsap.to(tw, {
          p: 1,
          duration: 0.4,
          ease: "power1.inOut",
          onUpdate: () => !this.destroyed && draw(tw.p),
          onComplete: () => {
            if (this.destroyed) return;
            tip.visible = false;
            // Rung ô nhẹ 2 px (chỉ hình trong ô, không rung bàn).
            const tl = this.gsap.timeline();
            for (let i = 0; i < 4; i++) {
              tl.to(inner.position, {
                x: (i % 2 ? -1 : 1) * 2 * (1 - i / 4),
                y: (i % 2 ? 1 : -1) * 1.2,
                duration: 0.03,
              });
            }
            tl.to(inner.position, { x: 0, y: 0, duration: 0.03 });
          },
        });
      },
    };
  }

  /** Ngôi sao ~80 % ô rơi từ trên xuống và nảy; chạm đất lóe 4 tia vàng ở 4 góc. */
  private boxStar(ctx: BoxCtx): BoxBuilt {
    const { inner, color, cell, h, alpha, thin } = ctx;
    const R = cell * 0.4;
    const star = new this.px.Graphics();
    star
      .star(0, 0, 5, R, R * 0.45, -Math.PI / 2)
      .fill({ color, alpha })
      .stroke({ width: thin, color, alpha: 0.9, join: "round" });
    const rays = new this.px.Graphics();
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const d = h * 0.75;
        rays.moveTo(sx * d, sy * d).lineTo(sx * (d + h * 0.35), sy * (d + h * 0.35));
      }
    }
    rays.stroke({ width: thin * 1.3, color: this.colors.accent, cap: "round" });
    rays.alpha = 0;
    inner.addChild(rays, star);
    return {
      animate: () => {
        star.y = -cell * 0.6;
        star.alpha = 0;
        star.scale.set(0.5);
        const tl = this.gsap.timeline();
        tl.to(star, { y: 0, alpha: 1, duration: 0.2, ease: "power2.in" })
          .to(star.scale, { x: 1.1, y: 1.1, duration: 0.2 }, 0)
          .call(() => {
            if (this.destroyed) return;
            rays.alpha = 1;
            rays.scale.set(0.5);
            this.gsap.to(rays.scale, { x: 1, y: 1, duration: 0.15 });
            this.gsap.to(rays, { alpha: 0, duration: 0.2, delay: 0.05 });
          })
          .to(star.scale, { x: 1, y: 1, duration: 0.15, ease: "back.out(3)" });
      },
    };
  }

  /** Dấu 10 điểm: vòng ngoài đứt quãng + chữ "10" nghiêng ±8°, đập từ to xuống, mực lan, rung bàn. */
  private boxStamp(ctx: BoxCtx): BoxBuilt {
    const { inner, box, color, size, h, thin } = ctx;
    const ring = new this.px.Graphics();
    const segs = 12;
    for (let k = 0; k < segs; k++) {
      // Vài đoạn đứt (tất định theo ô) như dấu đóng không đều mực.
      if (hash01(box * 11 + k) < 0.22) continue;
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 0.92) / segs) * Math.PI * 2;
      const r = h * 0.78;
      ring.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1);
    }
    ring.stroke({ width: thin * 2, color, alpha: 0.85, cap: "round" });
    ring.circle(0, 0, h * 0.62).stroke({ width: thin, color, alpha: 0.6 });
    const text = this.makeText("10", color, size * 0.5, false);
    text.alpha = 0.9;
    const stamp = new this.px.Container();
    stamp.addChild(ring, text);
    stamp.rotation = ((hash01(box * 7 + 1) * 2 - 1) * 8 * Math.PI) / 180;
    const bleed = new this.px.Graphics();
    bleed.circle(0, 0, h * 0.86).fill({ color });
    bleed.alpha = 0.12;
    inner.addChild(bleed, stamp);
    return {
      animate: () => {
        stamp.alpha = 0;
        stamp.scale.set(1.6);
        bleed.alpha = 0;
        const tl = this.gsap.timeline();
        tl.to(stamp, { alpha: 1, duration: 0.08 })
          .to(stamp.scale, { x: 1, y: 1, duration: 0.22, ease: "power3.in" }, 0)
          .call(() => {
            if (this.destroyed) return;
            // Mực lan quanh viền sau khi đập + rung bàn một lần nhẹ.
            this.gsap.to(bleed, { alpha: 0.12, duration: 0.3 });
            this.gsap.fromTo(bleed.scale, { x: 1, y: 1 }, { x: 1.15, y: 1.15, duration: 0.3 });
            this.shake(0.3);
          });
      },
    };
  }

  /** Đường tim (gốc ở tâm, bề ngang ~2w). */
  private heartPath(gfx: Graphics, w: number) {
    return gfx
      .moveTo(0, w * 0.75)
      .bezierCurveTo(-w * 1.35, -w * 0.1, -w * 0.6, -w * 1.05, 0, -w * 0.4)
      .bezierCurveTo(w * 0.6, -w * 1.05, w * 1.35, -w * 0.1, 0, w * 0.75)
      .closePath();
  }

  /** Trái tim đập hai nhịp khi hiện, 3 tim nhỏ bay lên tan dần; vệt sáng giấy ở góc trên trái. */
  private boxHeart(ctx: BoxCtx): BoxBuilt {
    const { inner, color, h, cell, alpha, thin, box } = ctx;
    const w = h * 0.95;
    const heart = new this.px.Graphics();
    this.heartPath(heart, w)
      .fill({ color, alpha: alpha + 0.25 })
      .stroke({ width: thin, color, alpha: 0.9, join: "round" });
    const hl = new this.px.Graphics();
    hl.ellipse(0, 0, w * 0.2, w * 0.1).fill({ color: this.colors.paper, alpha: 0.75 });
    hl.position.set(-w * 0.5, -w * 0.5);
    hl.rotation = -0.7;
    inner.addChild(heart, hl);
    return {
      animate: () => {
        const tl = this.gsap.timeline();
        tl.to(inner.scale, { x: 1.2, y: 1.2, duration: 0.1 })
          .to(inner.scale, { x: 1, y: 1, duration: 0.1 })
          .to(inner.scale, { x: 1.15, y: 1.15, duration: 0.12 })
          .to(inner.scale, { x: 1, y: 1, duration: 0.13 });
        // Ba tim nhỏ bay lên tan dần.
        for (let k = 0; k < 3; k++) {
          const m = new this.px.Graphics();
          this.heartPath(m, h * 0.22).fill({ color, alpha: 0.9 });
          m.position.set((hash01(box * 3 + k) - 0.5) * h, -h * 0.3);
          m.scale.set(0.5);
          inner.addChild(m);
          this.gsap.to(m, {
            y: -h * 0.3 - cell * 0.7,
            alpha: 0,
            duration: 0.6,
            delay: k * 0.1,
            ease: "power1.out",
            onComplete: () => !this.destroyed && m.destroy(),
          });
          this.gsap.to(m.scale, { x: 1, y: 1, duration: 0.3, delay: k * 0.1 });
        }
      },
    };
  }

  /** Đa giác tròn méo (đĩa sáp / nền cháy): `base(θ)` bán kính gốc, méo tất định theo ô. */
  private wobblyPoly(
    gfx: Graphics,
    box: number,
    n: number,
    base: (a: number) => number,
    amp: number,
  ) {
    const pts: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = base(a) * (1 + (hash01(box * 5 + k) - 0.5) * amp);
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return gfx.poly(pts);
  }

  /** Dấu sáp vàng: giọt sáp rơi và lan thành đĩa méo, con dấu đập in sao màu bút; sống: vệt lấp lánh. */
  private boxSeal(ctx: BoxCtx): BoxBuilt {
    const { inner, box, color, size, h, cell, thin } = ctx;
    const wax = new this.px.Graphics();
    this.wobblyPoly(wax, box, 14, () => h * 0.86, 0.14)
      .fill({ color: this.colors.accent, alpha: 0.95 })
      .stroke({ width: thin * 1.4, color: this.colors.ink, alpha: 0.9, join: "round" });
    const star = new this.px.Graphics();
    star.star(0, 0, 5, h * 0.55, h * 0.26, -Math.PI / 2).fill({ color, alpha: 0.95 });
    // Vệt lấp lánh: ellipse sáng cắt theo mặt sáp, chạy ngang qua mỗi ~3 s (ticker).
    const clip = new this.px.Graphics();
    this.wobblyPoly(clip, box, 14, () => h * 0.86, 0.14).fill(0xffffff);
    const shimmer = new this.px.Graphics();
    shimmer.ellipse(0, 0, h * 0.16, h * 1.1).fill({ color: 0xffffff, alpha: 0.55 });
    shimmer.rotation = 0.45;
    shimmer.mask = clip;
    shimmer.visible = false;
    inner.addChild(wax, star, clip, shimmer);
    return {
      animate: () => {
        wax.scale.set(0.3);
        wax.y = -cell * 0.5;
        star.alpha = 0;
        star.scale.set(1.6);
        const tl = this.gsap.timeline();
        tl.to(wax, { y: 0, duration: 0.1, ease: "power2.in" })
          .to(wax.scale, { x: 1, y: 1, duration: 0.25, ease: "back.out(1.6)" })
          .to(star, { alpha: 1, duration: 0.06 }, "-=0.08")
          .to(star.scale, { x: 1, y: 1, duration: 0.2, ease: "power3.in" }, "<");
      },
      live: (now) => {
        const phase = ((now + hash01(box) * 3000) % 3000) / 3000;
        if (phase < 0.14) {
          shimmer.visible = true;
          shimmer.x = (phase / 0.14 - 0.5) * size * 1.2;
        } else shimmer.visible = false;
      },
    };
  }

  /** Hoa điểm tốt: 5 cánh nở lần lượt quanh nhụy vàng, phấn hoa bay lên; sống: cả hoa khẽ lay. */
  private boxFlower(ctx: BoxCtx): BoxBuilt {
    const { inner, box, color, h, cell, alpha, thin } = ctx;
    const petals: Container[] = [];
    for (let k = 0; k < 5; k++) {
      const p = new this.px.Container();
      const g = new this.px.Graphics();
      g.ellipse(0, -h * 0.5, h * 0.24, h * 0.4)
        .fill({ color, alpha })
        .stroke({ width: thin * 0.7, color: this.colors.ink, alpha: 0.5 });
      p.addChild(g);
      p.rotation = (k / 5) * Math.PI * 2;
      inner.addChild(p);
      petals.push(p);
    }
    const pistil = new this.px.Graphics();
    pistil
      .circle(0, 0, h * 0.28)
      .fill(this.colors.accent)
      .stroke({ width: thin, color: this.colors.ink, alpha: 0.9 });
    inner.addChild(pistil);
    const phase = hash01(box * 3) * Math.PI * 2;
    return {
      animate: () => {
        petals.forEach((p, k) => {
          p.scale.set(0);
          this.gsap.to(p.scale, {
            x: 1,
            y: 1,
            duration: 0.25,
            delay: k * 0.08,
            ease: "back.out(2)",
          });
        });
        pistil.scale.set(0.6);
        this.gsap.to(pistil.scale, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
        // Phấn hoa vàng bay lên.
        for (let k = 0; k < 6; k++) {
          const d = new this.px.Graphics();
          d.circle(0, 0, cell * 0.025).fill({ color: this.colors.accent, alpha: 0.9 });
          inner.addChild(d);
          const ang = Math.random() * Math.PI * 2;
          this.gsap.to(d, {
            x: Math.cos(ang) * h * 0.8,
            y: -h * 0.4 - Math.random() * cell * 0.6,
            alpha: 0,
            duration: 0.5 + Math.random() * 0.3,
            delay: 0.1 + k * 0.05,
            ease: "power1.out",
            onComplete: () => !this.destroyed && d.destroy(),
          });
        }
      },
      live: (now) => {
        inner.rotation = ((3 * Math.PI) / 180) * Math.sin((now / 2000) * Math.PI * 2 + phase);
      },
    };
  }

  /**
   * Ô cháy: bùng lửa (hạt lửa dùng chung với Bút lửa) rồi để lại nền cháy xém mép lượn sóng + viền mực;
   * sống: 2 đốm than hồng nhấp nháy + 1 làn khói mỏng bay lên (tối đa 3 vật thể / ô, trần toàn bàn).
   */
  private boxFlame(ctx: BoxCtx): BoxBuilt {
    const { inner, box, form, color, h, cell, alpha, thin } = ctx;
    const char = new this.px.Graphics();
    // Hình vuông mép lượn sóng: bán kính theo góc của hình vuông, méo nhẹ tất định.
    this.wobblyPoly(
      char,
      box,
      20,
      (a) => h / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))),
      0.1,
    )
      .fill({ color, alpha })
      .stroke({ width: thin, color: this.colors.ink, alpha: 0.5, join: "round" });
    inner.addChild(char);
    const burst = () => this.flameBurst(ctx.x, ctx.y, form, 8);
    if (this.boxLive + 3 > BOX_LIVE_CAP) {
      return { animate: burst };
    }
    this.boxLive += 3;
    const embers: { g: Graphics; ph: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const e = new this.px.Graphics();
      e.circle(0, 0, cell * 0.03).fill(form.bright);
      e.position.set(
        (hash01(box * 17 + k) - 0.5) * h * 1.2,
        (hash01(box * 19 + k) - 0.5) * h * 1.2,
      );
      inner.addChild(e);
      embers.push({ g: e, ph: hash01(box * 23 + k) * Math.PI * 2 });
    }
    const smoke = new this.px.Graphics();
    smoke.circle(0, 0, cell * 0.035).fill({ color: 0x8a8a8a, alpha: 1 });
    smoke.alpha = 0;
    inner.addChild(smoke);
    const sx = (hash01(box * 29) - 0.5) * h;
    const sPhase = hash01(box * 31);
    return {
      animate: () => {
        char.alpha = 0;
        this.gsap.to(char, { alpha: 1, duration: 0.3, delay: 0.15 });
        burst();
      },
      live: (now) => {
        for (const e of embers) e.g.alpha = 0.45 + 0.55 * Math.max(0, Math.sin(now / 180 + e.ph));
        const t = (now / 1400 + sPhase) % 1;
        smoke.position.set(sx + Math.sin(t * 6) * h * 0.15, -h * 0.3 - h * 1.3 * t);
        smoke.scale.set(0.6 + t);
        smoke.alpha = 0.2 * (1 - t);
      },
    };
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
   * `ink` giọt mực, `chalk` bụi phấn trắng, `spark` tia điện không rơi, `star` sao vàng, `heart` tim nhỏ,
   * `image` ảnh của gói skin (`image`, nhuộm màu bút; chưa nạp → giấy).
   */
  private burst(
    x: number,
    y: number,
    color: number,
    kind: Particles = "paper",
    count = 10,
    spread = 1,
    image: Texture | null = null,
  ) {
    if (this.opts.reducedMotion) return;
    if (kind === "image" && !image) kind = "paper";
    const g = this.geo!;
    const layer = this.layers.fx;
    const palettes: Record<Particles, number[]> = {
      paper: [color, color, this.colors.paper, this.colors.accent],
      ink: [color, color, color, blend(color, this.colors.ink, 0.4)],
      chalk: [0xffffff, 0xf2f2f2, 0xe0e0e0, color],
      spark: [color, this.colors.accent, 0xffffff, color],
      star: [this.colors.accent, this.colors.accent, this.colors.paper, color],
      heart: [color, color, blend(color, 0xffffff, 0.45), this.colors.paper],
      image: [color, color, 0xffffff, color],
    };
    const palette = palettes[kind];
    const parts: { s: Container; vx: number; vy: number; rot: number }[] = [];
    const speed = g.cell * (kind === "spark" ? 2.4 : 1.6) * spread;
    const n = kind === "spark" || kind === "chalk" ? Math.round(count * 1.4) : count;
    for (let i = 0; i < n; i++) {
      const c = palette[i % palette.length];
      const w = g.cell * (0.08 + Math.random() * 0.1);
      const h = g.cell * (0.05 + Math.random() * 0.06);
      let s: Container;
      if (kind === "image" && image) {
        const sp = new this.px.Sprite(image);
        sp.anchor.set(0.5);
        sp.scale.set(
          (g.cell * (0.14 + Math.random() * 0.12)) / Math.max(image.width, image.height),
        );
        sp.tint = c;
        s = sp;
      } else {
        const gfx = new this.px.Graphics();
        s = gfx;
        switch (kind) {
          case "ink":
            gfx
              .circle(0, 0, g.cell * (0.03 + Math.random() * 0.05))
              .fill({ color: c, alpha: 0.85 });
            break;
          case "chalk":
            gfx.rect(-h / 2, -h / 2, h, h).fill({ color: c, alpha: 0.8 });
            break;
          case "spark":
            gfx
              .moveTo(-w * 0.8, 0)
              .lineTo(w * 0.8, 0)
              .stroke({ width: Math.max(1.5, h * 0.5), color: c });
            break;
          case "star":
            gfx
              .star(0, 0, 5, h * 1.1, h * 0.5)
              .fill(c)
              .stroke({ width: 1, color: this.colors.ink, alpha: 0.6 });
            break;
          case "heart":
            this.heartPath(gfx, h * 0.9)
              .fill(c)
              .stroke({ width: 1, color: this.colors.ink, alpha: 0.5 });
            break;
          case "paper":
          default:
            gfx
              .roundRect(-w / 2, -h / 2, w, h, h * 0.3)
              .fill(c)
              .stroke({ width: 1, color: this.colors.ink, alpha: 0.7 });
        }
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
    const { pen: skin, form } = this.penFor(by);
    const penColor = form.color;
    const text = this.comboText(label, skin, form, fontSize);
    // Giữ chữ trong khung canvas.
    const halfW = text.width / 2 + 4;
    const x = Math.min(g.width - halfW, Math.max(halfW, cx));
    const y = Math.max(fontSize, cy - g.cell * 0.2);
    text.position.set(x, y);
    text.scale.set(0.2);
    text.rotation = (Math.random() - 0.5) * (skin.combo.style === "ink" ? 0.5 : 0.3);
    this.layers.fx.addChild(text);
    this.burst(
      x,
      y,
      penColor,
      skin.combo.particles,
      6 + combo * 2,
      1.4,
      this.texture(assetUrl(skin, skin.combo.particleImage)),
    );
    if (skin.combo.style === "sparkle") this.burst(x, y, penColor, "star", 8, 1.8);
    if (skin.combo.style === "fire") {
      this.burst(x, y, form.color2, "spark", 6, 1.6);
      this.flameBurst(x, y, form, 6 + combo * 2);
    }
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

  /**
   * Chữ COMBO theo kiểu của skin bút (docs/08): sticker, mực, phấn, neon, lấp lánh, lửa — màu lấy
   * từ hình thái (mình / đối thủ) của bút.
   */
  private comboText(label: string, skin: PenSkin, form: RForm, fontSize: number) {
    switch (skin.combo.style) {
      case "ink":
        return this.makeText(label, form.color, fontSize, true, this.colors.paper);
      case "chalk": {
        const t = this.makeText(label, form.color, fontSize, false);
        t.alpha = 0.92;
        return t;
      }
      case "neon":
        return this.makeText(label, form.glow, fontSize * 1.1, true, form.color);
      case "sparkle":
        // Cầu vồng: màu giữa dải (glow mặc định = màu chính); bút vàng: màu quầng.
        return this.makeText(label, form.glow, fontSize * 1.1, true, this.colors.ink);
      case "fire":
        return this.makeText(label, form.color2, fontSize * 1.1, true, form.color);
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
    const counter = this.makeText("", this.penColor(s.human), Math.max(28, g.cell * 1.1));
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
          counter.style.fill = this.penColor(owner);
          counter.alpha = 1;
          counter.scale.set(1.25);
          this.gsap.to(counter.scale, { x: 1, y: 1, duration: 0.18, ease: "power2.out" });
          if (box) {
            box.c.scale.set(1.3);
            this.gsap.to(box.c.scale, { x: 1, y: 1, duration: 0.25, ease: "back.out(2)" });
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
    this.preview.under.clear();
    this.preview.main.clear();
    this.preview.over.clear();
    if (edge === null || !this.session) return;
    // Xem trước bằng hình thái "mình" của bút ghế mình.
    const { pen, form } = this.penFor(this.session.human);
    this.drawStroke(this.preview, edge, 1, 0.35, pen, form);
    this.host.style.cursor = "pointer";
  }
}

// ---------- Màu & toán phụ ----------

function parseHex(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/** Độ sáng cảm nhận 0–255 (chọn màu sáng nhất của hình thái cho vệt ánh kim). */
function luma(c: number): number {
  return 0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff);
}

/** Hash tất định 0–1 theo số nguyên (vị trí chấm sáp, lệch pha ánh kim). */
function hash01(seed: number): number {
  const h = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Điểm tại tham số t (0–1) trên polyline đều. */
function pointAt(pts: { x: number; y: number }[], t: number): { x: number; y: number } {
  const total = pts.length - 1;
  const x = Math.min(total, Math.max(0, t * total));
  const i = Math.min(total - 1, Math.floor(x));
  const u = x - i;
  return {
    x: pts[i].x + (pts[i + 1].x - pts[i].x) * u,
    y: pts[i].y + (pts[i + 1].y - pts[i].y) * u,
  };
}

/** Màu tại vị trí t trên dải nhiều mốc; `cyclic` nối mốc cuối về mốc đầu (cầu vồng trôi). */
function gradientAt(stops: number[], t: number, cyclic: boolean): number {
  const n = cyclic ? stops.length : stops.length - 1;
  if (n <= 0) return stops[0];
  const u = cyclic ? ((t % 1) + 1) % 1 : Math.min(1, Math.max(0, t));
  const x = u * n;
  const i = Math.min(n - 1, Math.floor(x));
  return blend(stops[i], stops[(i + 1) % stops.length], x - i);
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
