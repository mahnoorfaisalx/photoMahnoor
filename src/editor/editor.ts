// Core editor engine: wraps a Fabric canvas with documents, layers, tools, history and pixel selections.
import {
  Canvas,
  StaticCanvas,
  FabricObject,
  FabricImage,
  Rect,
  Ellipse,
  Path,
  IText,
  Group,
  Circle,
  FabricText,
  PencilBrush,
  Point,
  Shadow,
  Gradient,
  ActiveSelection,
  util,
  config,
  type TPointerEventInfo,
  type TPointerEvent,
} from 'fabric';
import { Arrow, EffectRegion, CUSTOM_PROPS } from './objects';
import { applyAdjustments, normalizeAdjust, type Adjustments } from './adjustments';
import { SHAPE_PATHS, ensureFont } from './shapes';
import { useStore, type DocState, type LayerInfo, type Tool } from '../store';
import {
  createCanvas,
  ctx2d,
  floodSelect,
  maskBounds,
  dilate,
  inpaint,
  featherMask,
  boxBlur,
  canvasToBlob,
} from '../lib/imageOps';

// --- Fabric global defaults --------------------------------------------------
FabricObject.ownDefaults.transparentCorners = false;
FabricObject.ownDefaults.cornerColor = '#ffffff';
FabricObject.ownDefaults.cornerStrokeColor = '#3b82f6';
FabricObject.ownDefaults.borderColor = '#3b82f6';
FabricObject.ownDefaults.cornerSize = 11;
FabricObject.ownDefaults.cornerStyle = 'circle';
FabricObject.ownDefaults.borderScaleFactor = 1.5;
FabricObject.ownDefaults.padding = 0;
(FabricObject.ownDefaults as any).objectCaching = true;
config.configure({ textureSize: 8192 });

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

type AnyObj = FabricObject & {
  id?: string;
  name?: string;
  layerType?: string;
  locked?: boolean;
  isTemp?: boolean;
  adjust?: Adjustments;
  cornerRadius?: number;
  fillMode?: FillMode;
};

export interface FillMode {
  mode: 'solid' | 'linear' | 'radial' | 'none';
  c1: string;
  c2: string;
  angle: number;
}

export interface Snapshot {
  doc: DocState;
  objects: any[];
}

export interface ProjectFile {
  app: 'photomahnoor';
  version: 1;
  doc: DocState;
  objects: any[];
  assets: Record<string, string>; // assetId -> dataURL
}

const WORKSPACE = '#1e1f24';
const ANNOTATION_TOOLS: Tool[] = ['arrow', 'line', 'highlight', 'blur', 'pixelate', 'redact', 'counter'];
const DRAG_TOOLS: Tool[] = [
  'rect', 'ellipse', 'triangle', 'star', 'polygon', 'bubble', 'highlight', 'blur', 'pixelate', 'redact', 'marquee', 'crop',
];

function checkerPattern(ctx: CanvasRenderingContext2D) {
  const c = createCanvas(16, 16);
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#d6d6d6';
  x.fillRect(0, 0, 8, 8);
  x.fillRect(8, 8, 8, 8);
  return ctx.createPattern(c, 'repeat')!;
}

// --- Canvas subclass with document/workspace rendering ------------------------
class EditorCanvas extends Canvas {
  isInteractive = true;
  ed!: Editor;
  private pattern: CanvasPattern | null = null;

  _renderBackground(ctx: CanvasRenderingContext2D) {
    const ed = this.ed;
    const v = this.viewportTransform;
    ctx.save();
    ctx.fillStyle = WORKSPACE;
    ctx.fillRect(0, 0, this.width, this.height);
    const z = v[0];
    const x = v[4],
      y = v[5],
      w = ed.doc.width * z,
      h = ed.doc.height * z;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    const r = Math.min(ed.doc.cornerRadius * z, w / 2, h / 2);
    if (r > 0) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    if (!this.pattern) this.pattern = checkerPattern(ctx);
    ctx.fillStyle = this.pattern;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (ed.doc.background) {
      ctx.fillStyle = ed.doc.background;
      ctx.fill();
    }
    ctx.restore();
  }

  _renderOverlay(ctx: CanvasRenderingContext2D) {
    const ed = this.ed;
    const v = this.viewportTransform;
    const z = v[0];
    const x = v[4],
      y = v[5],
      w = ed.doc.width * z,
      h = ed.doc.height * z;
    ctx.save();
    // dim everything outside the document
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    const r = Math.min(ed.doc.cornerRadius * z, w / 2, h / 2);
    if (r > 0) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = 'rgba(30,31,36,0.82)';
    ctx.fill('evenodd');
    // pixel selection overlay
    if (ed.selDisplay) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ed.selDisplay, x, y, w, h);
    }
    // in-progress lasso
    if (ed.lassoPts.length > 1) {
      ctx.beginPath();
      ed.lassoPts.forEach((p, i) => (i ? ctx.lineTo(x + p.x * z, y + p.y * z) : ctx.moveTo(x + p.x * z, y + p.y * z)));
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = '#000';
      ctx.lineDashOffset = 5;
      ctx.stroke();
    }
    // brush cursor
    if (ed.brushCursor) {
      ctx.beginPath();
      ctx.arc(x + ed.brushCursor.x * z, y + ed.brushCursor.y * z, (ed.brushRadius() * z), 0, Math.PI * 2);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    // crop mask
    const crop = ed.cropRect;
    if (crop) {
      const b = ed.cropBox();
      const cx = x + b.left * z,
        cy = y + b.top * z;
      const cw = b.width * z,
        ch = b.height * z;
      ctx.beginPath();
      ctx.rect(0, 0, this.width, this.height);
      ctx.rect(cx, cy, cw, ch);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(cx + (cw * i) / 3, cy);
        ctx.lineTo(cx + (cw * i) / 3, cy + ch);
        ctx.moveTo(cx, cy + (ch * i) / 3);
        ctx.lineTo(cx + cw, cy + (ch * i) / 3);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(`${Math.round(b.width)} × ${Math.round(b.height)}`, cx + 6, cy - 8);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export class Editor {
  canvas!: EditorCanvas;
  container!: HTMLElement;
  doc: DocState = { width: 1280, height: 720, background: '#ffffff', cornerRadius: 0, name: 'Untitled' };
  autoSize = true; // first image import sets doc size
  history: Snapshot[] = [];
  hIndex = -1;
  restoring = false;
  clipboard: any[] | null = null;
  clipboardStamp = '';
  assets = new Map<string, Blob>(); // blobURL -> Blob
  projectId: string = uid();

  // pixel selection
  selMask: Uint8Array | null = null;
  selDisplay: HTMLCanvasElement | null = null;
  lassoPts: { x: number; y: number }[] = [];
  brushCursor: { x: number; y: number } | null = null;
  cropRect: Rect | null = null;

  private drawing: { tool: Tool; start: Point; obj?: AnyObj; moved: boolean } | null = null;
  private panning: { x: number; y: number } | null = null;
  private spaceDown = false;
  private compositeCache: { key: number; data: ImageData } | null = null;
  private syncQueued = false;
  private commitTimer: number | undefined;
  private thumbTimer: number | undefined;
  private changeCounter = 0;
  onCommit: (() => void) | null = null;

  get store() {
    return useStore.getState();
  }

  // ---------------------------------------------------------------- mounting
  mount(el: HTMLCanvasElement, container: HTMLElement) {
    this.container = container;
    const c = new EditorCanvas(el, {
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireMiddleClick: true,
      controlsAboveOverlay: true,
      targetFindTolerance: 6,
      selectionColor: 'rgba(59,130,246,0.12)',
      selectionBorderColor: '#3b82f6',
      selectionLineWidth: 1,
      enableRetinaScaling: true,
    });
    c.ed = this;
    this.canvas = c;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.bindEvents();
    this.applyTool(this.store.tool);
    useStore.subscribe((s, prev) => {
      if (s.tool !== prev.tool) this.applyTool(s.tool);
    });
    this.resetHistory();
    this.fit();
  }

  resize() {
    if (!this.canvas) return;
    const r = this.container.getBoundingClientRect();
    this.canvas.setDimensions({ width: Math.max(50, r.width), height: Math.max(50, r.height) });
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- view
  setZoom(z: number, at?: Point) {
    z = Math.min(32, Math.max(0.02, z));
    const p = at ?? new Point(this.canvas.width / 2, this.canvas.height / 2);
    this.canvas.zoomToPoint(p, z);
    this.afterViewChange();
  }
  zoomBy(f: number, at?: Point) {
    this.setZoom(this.canvas.getZoom() * f, at);
  }
  fit() {
    const cw = this.canvas.width,
      ch = this.canvas.height;
    const z = Math.min((cw - 80) / this.doc.width, (ch - 80) / this.doc.height, 4);
    const zz = Math.max(0.02, z);
    this.canvas.setViewportTransform([
      zz, 0, 0, zz,
      (cw - this.doc.width * zz) / 2,
      (ch - this.doc.height * zz) / 2,
    ]);
    this.afterViewChange();
  }
  actualSize() {
    const cw = this.canvas.width,
      ch = this.canvas.height;
    this.canvas.setViewportTransform([1, 0, 0, 1, (cw - this.doc.width) / 2, (ch - this.doc.height) / 2]);
    this.afterViewChange();
  }
  pan(dx: number, dy: number) {
    const v = this.canvas.viewportTransform.slice() as any;
    v[4] += dx;
    v[5] += dy;
    this.canvas.setViewportTransform(v);
    this.afterViewChange();
  }
  private afterViewChange() {
    this.canvas.getObjects().forEach((o) => o.setCoords());
    useStore.setState({ zoom: this.canvas.getZoom() });
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- objects
  objects(): AnyObj[] {
    return this.canvas.getObjects().filter((o: AnyObj) => !o.isTemp) as AnyObj[];
  }
  byId(id: string): AnyObj | undefined {
    return this.objects().find((o) => o.id === id);
  }
  active(): AnyObj | null {
    return (this.canvas.getActiveObject() as AnyObj) ?? null;
  }
  activeObjects(): AnyObj[] {
    return this.canvas.getActiveObjects() as AnyObj[];
  }

  kindOf(o: AnyObj): string {
    if (o.layerType) return o.layerType;
    if (o instanceof FabricImage) return 'image';
    if (o instanceof FabricText) return 'text';
    return 'shape';
  }

  private prepare(o: AnyObj, name?: string, layerType?: string) {
    if (!o.id) o.id = uid();
    if (layerType) o.layerType = layerType;
    if (!o.name) o.name = name || this.defaultName(o);
    this.applyLock(o);
    return o;
  }

  private defaultName(o: AnyObj) {
    if (o instanceof FabricImage) return 'Image';
    if (o instanceof FabricText) return ((o as FabricText).text || 'Text').slice(0, 24);
    if (o instanceof Arrow) return 'Arrow';
    if (o instanceof EffectRegion) return o.effect === 'blur' ? 'Blur' : 'Pixelate';
    return o.type ? o.type[0].toUpperCase() + o.type.slice(1) : 'Layer';
  }

  applyLock(o: AnyObj) {
    const l = !!o.locked;
    o.lockMovementX = l;
    o.lockMovementY = l;
    o.lockRotation = l;
    o.lockScalingX = l;
    o.lockScalingY = l;
    o.hasControls = !l;
    (o as any).editable = !l;
  }

  add(o: AnyObj, opts: { name?: string; layerType?: string; select?: boolean; index?: number } = {}) {
    this.prepare(o, opts.name, opts.layerType);
    if (opts.index !== undefined) this.canvas.insertAt(opts.index, o);
    else this.canvas.add(o);
    if (opts.select !== false) this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    return o;
  }

  docCenter() {
    return new Point(this.doc.width / 2, this.doc.height / 2);
  }

  // ---------------------------------------------------------------- images
  async addImageFromBlob(blob: Blob, opts: { name?: string; at?: Point; fitDoc?: boolean } = {}) {
    const url = URL.createObjectURL(blob);
    this.assets.set(url, blob);
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const isEmpty = this.objects().length === 0;
    if ((this.autoSize && isEmpty) || opts.fitDoc) {
      this.doc = { ...this.doc, width: img.width, height: img.height, name: this.doc.name === 'Untitled' && opts.name ? opts.name.replace(/\.[^.]+$/, '') : this.doc.name };
      this.autoSize = false;
      this.clearPixelSelection();
      useStore.setState({ doc: this.doc });
      img.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
      this.add(img as AnyObj, { name: opts.name || 'Image', layerType: 'image' });
      this.fit();
    } else {
      const maxW = this.doc.width * 0.9,
        maxH = this.doc.height * 0.9;
      const s = Math.min(1, maxW / img.width, maxH / img.height);
      const c = opts.at ?? this.docCenter();
      img.set({ scaleX: s, scaleY: s, originX: 'center', originY: 'center', left: c.x, top: c.y });
      this.add(img as AnyObj, { name: opts.name || 'Image', layerType: 'image' });
    }
    this.commit('Add image');
    return img;
  }

  async addImageFiles(files: File[] | FileList, at?: Point) {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      try {
        await this.addImageFromBlob(f, { name: f.name, at });
      } catch (e) {
        this.store.toast(`Could not open ${f.name}`, 'error');
      }
    }
  }

  registerBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    this.assets.set(url, blob);
    return url;
  }

  // ---------------------------------------------------------------- creators
  addText(text = 'Double-click to edit', at?: Point, extra: Record<string, unknown> = {}) {
    const o = this.store.options;
    const c = at ?? this.docCenter();
    const fontSize = Math.max(12, Math.round(Math.min(this.doc.width, this.doc.height) / 12)) || o.fontSize;
    const t = new IText(text, {
      left: c.x,
      top: c.y,
      originX: 'center',
      originY: 'center',
      fontFamily: o.fontFamily,
      fontSize,
      fill: '#111111',
      textAlign: 'center',
      ...extra,
    }) as unknown as AnyObj;
    if (extra.shadow && !(extra.shadow instanceof Shadow)) t.shadow = new Shadow(extra.shadow as any);
    this.add(t, { layerType: 'text', name: text.slice(0, 24) });
    ensureFont(String((t as any).fontFamily), (t as any).fontWeight).then(() => {
      (t as any).initDimensions?.();
      this.canvas.requestRenderAll();
    });
    this.commit('Add text');
    return t;
  }

  makeShape(kind: string, x: number, y: number, w: number, h: number): AnyObj {
    const o = this.store.options;
    const common = {
      left: x,
      top: y,
      originX: 'left' as const,
      originY: 'top' as const,
      fill: o.fill,
      stroke: null as any,
      strokeWidth: 0,
      strokeUniform: true,
    };
    if (kind === 'rect') return new Rect({ ...common, width: w, height: h, rx: 0, ry: 0 }) as AnyObj;
    if (kind === 'ellipse') return new Ellipse({ ...common, rx: w / 2, ry: h / 2 }) as AnyObj;
    const d = SHAPE_PATHS[kind] || SHAPE_PATHS.star;
    const p = new Path(d, { ...common }) as AnyObj;
    p.set({ scaleX: w / (p.width || 100), scaleY: h / (p.height || 100) });
    return p;
  }

  addShape(kind: string) {
    const s = Math.min(this.doc.width, this.doc.height) * 0.3;
    const c = this.docCenter();
    const o = this.makeShape(kind, c.x - s / 2, c.y - s / 2, s, s);
    this.add(o, { layerType: 'shape', name: kind[0].toUpperCase() + kind.slice(1) });
    this.commit('Add shape');
  }

  makeArrow(x1: number, y1: number, x2: number, y2: number, heads: boolean) {
    const o = this.store.options;
    const a = new Arrow({
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2,
      x1: (x1 - x2) / 2,
      y1: (y1 - y2) / 2,
      x2: (x2 - x1) / 2,
      y2: (y2 - y1) / 2,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth,
      headEnd: heads,
    });
    return a as unknown as AnyObj;
  }

  addCounter(at: Point) {
    const o = this.store.options;
    const n = o.counterNext;
    const r = Math.max(16, Math.round(Math.min(this.doc.width, this.doc.height) / 40));
    const circle = new Circle({ radius: r, fill: o.stroke, originX: 'center', originY: 'center', stroke: '#ffffff', strokeWidth: Math.max(2, r / 8) });
    const label = new FabricText(String(n), {
      fontFamily: 'Inter, Arial, sans-serif',
      fontWeight: 'bold',
      fontSize: r * 1.15,
      fill: '#ffffff',
      originX: 'center',
      originY: 'center',
    });
    const g = new Group([circle, label], { left: at.x, top: at.y, originX: 'center', originY: 'center' }) as AnyObj;
    g.shadow = new Shadow({ color: 'rgba(0,0,0,0.35)', blur: 6, offsetX: 0, offsetY: 2 });
    this.add(g, { layerType: 'counter', name: `Step ${n}` });
    useStore.getState().setOptions({ counterNext: n + 1 });
    this.commit('Add step marker');
  }

  // ---------------------------------------------------------------- tools
  applyTool(t: Tool) {
    const c = this.canvas;
    if (!c) return;
    if (t !== 'crop' && this.cropRect) this.cancelCrop();
    c.isDrawingMode = t === 'pen' || t === 'highlighter';
    const creation = t !== 'select';
    c.selection = t === 'select';
    c.skipTargetFind = creation;
    this.brushCursor = null;
    if (creation && t !== 'crop') c.discardActiveObject();
    if (c.isDrawingMode) {
      const b = new PencilBrush(c);
      const o = this.store.options;
      if (t === 'highlighter') {
        b.color = hexToRgba(o.highlightColor, 0.45);
        b.width = Math.max(12, o.strokeWidth * 4);
      } else {
        b.color = o.stroke;
        b.width = o.strokeWidth;
      }
      b.decimate = 2;
      c.freeDrawingBrush = b;
    }
    const cursors: Partial<Record<Tool, string>> = {
      hand: 'grab',
      text: 'text',
      eyedropper: 'copy',
      wand: 'crosshair',
      brushSelect: 'none',
    };
    c.defaultCursor = cursors[t] ?? (creation ? 'crosshair' : 'default');
    c.hoverCursor = creation ? c.defaultCursor : 'move';
    if (t === 'crop') this.startCrop();
    c.requestRenderAll();
  }

  refreshBrush() {
    this.applyTool(this.store.tool);
  }

  brushRadius() {
    return this.store.options.brushSize / 2;
  }

  private bindEvents() {
    const c = this.canvas;
    c.on('mouse:down', (opt) => this.onDown(opt));
    c.on('mouse:move', (opt) => this.onMove(opt));
    c.on('mouse:up', (opt) => this.onUp(opt));
    c.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.pow(0.998, e.deltaY * (e.deltaMode === 1 ? 30 : 1));
        this.zoomBy(f, new Point(e.offsetX, e.offsetY));
      } else {
        this.pan(-e.deltaX, -e.deltaY);
      }
    });
    c.on('object:modified', () => this.commit('Transform'));
    c.on('text:editing:exited', (opt: any) => {
      const t = opt.target as AnyObj;
      if (t && !(t as any).text?.trim()) {
        c.remove(t);
      } else if (t) {
        t.name = ((t as any).text || 'Text').slice(0, 24);
      }
      this.commit('Edit text');
    });
    c.on('text:changed', () => this.queueSync());
    c.on('path:created', (opt: any) => {
      const p = opt.path as AnyObj;
      const hl = this.store.tool === 'highlighter';
      p.set({ strokeUniform: true });
      if (hl) p.globalCompositeOperation = 'multiply';
      this.prepare(p, hl ? 'Highlighter' : 'Drawing', 'draw');
      this.commit('Draw');
    });
    const sel = () => {
      useStore.setState({ selectedIds: this.activeObjects().map((o) => o.id!).filter(Boolean), selVersion: this.store.selVersion + 1 });
    };
    c.on('selection:created', sel);
    c.on('selection:updated', sel);
    c.on('selection:cleared', sel);
    c.on('object:added', () => this.queueSync());
    c.on('object:removed', () => this.queueSync());
    c.on('object:scaling', () => this.bumpSel());
    c.on('object:moving', () => this.bumpSel());
    c.on('object:rotating', () => this.bumpSel());
    c.on('object:modified', () => this.bumpSel());
  }

  private bumpSel() {
    useStore.setState({ selVersion: this.store.selVersion + 1 });
  }

  setSpace(down: boolean) {
    this.spaceDown = down;
    if (!this.canvas) return;
    this.canvas.defaultCursor = down ? 'grab' : this.store.tool === 'hand' ? 'grab' : this.canvas.defaultCursor;
    if (down) {
      this.canvas.skipTargetFind = true;
      this.canvas.selection = false;
    } else this.applyTool(this.store.tool);
  }

  private scene(opt: TPointerEventInfo<TPointerEvent>) {
    return (opt as any).scenePoint as Point;
  }

  private onDown(opt: TPointerEventInfo<TPointerEvent>) {
    const e = opt.e as MouseEvent;
    const tool = this.store.tool;
    if (e.button === 1 || this.spaceDown || tool === 'hand') {
      this.panning = { x: e.clientX, y: e.clientY };
      this.canvas.setCursor('grabbing');
      return;
    }
    if (e.button === 2) return;
    const p = this.scene(opt);
    if (tool === 'text') {
      this.addText('Your text', p);
      const t = this.active() as any;
      useStore.getState().setTool('select');
      setTimeout(() => {
        t?.enterEditing?.();
        t?.selectAll?.();
        this.canvas.requestRenderAll();
      }, 0);
      return;
    }
    if (tool === 'counter') {
      this.addCounter(p);
      return;
    }
    if (tool === 'eyedropper') {
      this.pickColor(p, e.altKey ? 'stroke' : 'fill');
      return;
    }
    if (tool === 'wand') {
      this.wandSelect(p, this.selModeFromEvent(e));
      return;
    }
    if (tool === 'brushSelect') {
      this.drawing = { tool, start: p, moved: false };
      this.brushStamp(p, e.altKey ? 'subtract' : 'add');
      return;
    }
    if (tool === 'lasso') {
      this.lassoPts = [{ x: p.x, y: p.y }];
      this.drawing = { tool, start: p, moved: false };
      return;
    }
    if (tool === 'crop') {
      return; // handled by crop rect object
    }
    if (DRAG_TOOLS.includes(tool) || tool === 'arrow' || tool === 'line') {
      this.drawing = { tool, start: p, moved: false };
    }
  }

  private onMove(opt: TPointerEventInfo<TPointerEvent>) {
    const e = opt.e as MouseEvent;
    if (this.panning) {
      this.pan(e.clientX - this.panning.x, e.clientY - this.panning.y);
      this.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    const tool = this.store.tool;
    const p = this.scene(opt);
    if (tool === 'brushSelect') {
      this.brushCursor = { x: p.x, y: p.y };
      if (this.drawing) this.brushStamp(p, e.altKey ? 'subtract' : 'add');
      this.canvas.requestRenderAll();
      return;
    }
    const d = this.drawing;
    if (!d) return;
    if (tool === 'lasso') {
      this.lassoPts.push({ x: p.x, y: p.y });
      this.canvas.requestRenderAll();
      return;
    }
    const dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * this.canvas.getZoom() < 3) return;
    d.moved = true;
    let x = Math.min(p.x, d.start.x),
      y = Math.min(p.y, d.start.y);
    let w = Math.abs(dx),
      h = Math.abs(dy);
    if (e.shiftKey && tool !== 'arrow' && tool !== 'line') {
      const s = Math.max(w, h);
      w = h = s;
      x = dx < 0 ? d.start.x - s : d.start.x;
      y = dy < 0 ? d.start.y - s : d.start.y;
    }
    if (d.obj) this.canvas.remove(d.obj);
    let obj: AnyObj;
    if (tool === 'arrow' || tool === 'line') {
      let ex = p.x,
        ey = p.y;
      if (e.shiftKey) {
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        ex = d.start.x + Math.cos(ang) * len;
        ey = d.start.y + Math.sin(ang) * len;
      }
      obj = this.makeArrow(d.start.x, d.start.y, ex, ey, tool === 'arrow');
    } else obj = this.makeDragObject(tool, x, y, Math.max(1, w), Math.max(1, h));
    obj.isTemp = true;
    obj.evented = false;
    d.obj = obj;
    this.canvas.add(obj);
    this.canvas.requestRenderAll();
  }

  private makeDragObject(tool: Tool, x: number, y: number, w: number, h: number): AnyObj {
    const o = this.store.options;
    switch (tool) {
      case 'highlight':
        return new Rect({
          left: x, top: y, width: w, height: h, fill: hexToRgba(o.highlightColor, 0.5),
          globalCompositeOperation: 'multiply', strokeWidth: 0,
        }) as AnyObj;
      case 'redact':
        return new Rect({ left: x, top: y, width: w, height: h, fill: '#000000', strokeWidth: 0 }) as AnyObj;
      case 'blur':
      case 'pixelate':
        return new EffectRegion({ left: x, top: y, width: w, height: h, effect: tool, strength: o.effectStrength }) as unknown as AnyObj;
      case 'marquee':
        return new Rect({
          left: x, top: y, width: w, height: h, fill: 'rgba(59,130,246,0.12)', stroke: '#3b82f6',
          strokeDashArray: [6, 4], strokeWidth: 1, strokeUniform: true,
        }) as AnyObj;
      default:
        return this.makeShape(tool, x, y, w, h);
    }
  }

  private onUp(opt: TPointerEventInfo<TPointerEvent>) {
    if (this.panning) {
      this.panning = null;
      this.canvas.setCursor(this.store.tool === 'hand' || this.spaceDown ? 'grab' : this.canvas.defaultCursor);
      return;
    }
    const d = this.drawing;
    this.drawing = null;
    if (!d) return;
    const tool = d.tool;
    const e = opt.e as MouseEvent;
    if (tool === 'brushSelect') {
      this.refreshSelDisplay();
      return;
    }
    if (tool === 'lasso') {
      const pts = this.lassoPts;
      this.lassoPts = [];
      if (pts.length > 2) this.selectPolygon(pts, this.selModeFromEvent(e));
      this.canvas.requestRenderAll();
      return;
    }
    let obj = d.obj;
    if (obj) this.canvas.remove(obj);
    if (tool === 'marquee') {
      if (obj && d.moved) {
        const b = obj.getBoundingRect();
        this.selectRect(b.left, b.top, b.width, b.height, this.selModeFromEvent(e));
      } else this.clearPixelSelection();
      return;
    }
    if (!d.moved || !obj) {
      // click: create default-size object
      const s = Math.min(this.doc.width, this.doc.height) * 0.2;
      if (tool === 'arrow' || tool === 'line') obj = this.makeArrow(d.start.x - s / 2, d.start.y, d.start.x + s / 2, d.start.y, tool === 'arrow');
      else obj = this.makeDragObject(tool, d.start.x - s / 2, d.start.y - s / 2, s, tool === 'highlight' ? s / 4 : s);
    }
    obj.isTemp = false;
    obj.evented = true;
    const names: Partial<Record<Tool, [string, string]>> = {
      highlight: ['Highlight', 'annotation'],
      redact: ['Redaction', 'annotation'],
      blur: ['Blur region', 'effect'],
      pixelate: ['Pixelate region', 'effect'],
      arrow: ['Arrow', 'annotation'],
      line: ['Line', 'annotation'],
    };
    const [name, lt] = names[tool] ?? [tool[0].toUpperCase() + tool.slice(1), 'shape'];
    this.add(obj, { name, layerType: lt });
    this.commit(`Add ${name}`);
    if (!ANNOTATION_TOOLS.includes(tool)) useStore.getState().setTool('select');
    else {
      // keep tool active for quick repeated annotations but show the new object
      this.canvas.setActiveObject(obj);
    }
  }

  // ---------------------------------------------------------------- properties
  /** Set props on all active objects (or given objects). */
  setProps(props: Record<string, any>, opts: { commit?: 'now' | 'debounce' | 'none'; targets?: AnyObj[] } = {}) {
    const targets = opts.targets ?? this.expandSelection();
    for (const o of targets) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'shadow') o.shadow = v ? new Shadow(v) : null;
        else if (k === 'cornerRadius') this.setCornerRadius(o, v);
        else o.set(k as any, v);
      }
      if (o instanceof Arrow) o.normalize();
      if ((o as any).initDimensions && ('fontSize' in props || 'fontFamily' in props || 'text' in props || 'charSpacing' in props || 'lineHeight' in props || 'fontWeight' in props)) (o as any).initDimensions();
      o.dirty = true;
      o.setCoords();
    }
    if (props.fontFamily) {
      ensureFont(props.fontFamily, props.fontWeight).then(() => {
        targets.forEach((t: any) => {
          t.initDimensions?.();
          t.dirty = true;
        });
        this.canvas.requestRenderAll();
      });
    }
    this.canvas.requestRenderAll();
    this.bumpSel();
    this.queueSync();
    const mode = opts.commit ?? 'debounce';
    if (mode === 'now') this.commit('Change properties');
    else if (mode === 'debounce') this.commitDebounced();
  }

  /** active selection objects, with groups of type ActiveSelection expanded */
  expandSelection(): AnyObj[] {
    return this.activeObjects();
  }

  setFillMode(fm: FillMode, targets = this.expandSelection(), prop: 'fill' | 'stroke' = 'fill') {
    for (const o of targets) {
      o.fillMode = fm;
      if (fm.mode === 'none') o.set(prop, prop === 'fill' ? 'rgba(0,0,0,0)' : null);
      else if (fm.mode === 'solid') o.set(prop, fm.c1);
      else {
        const rad = (fm.angle * Math.PI) / 180;
        const coords =
          fm.mode === 'linear'
            ? { x1: 0.5 - Math.cos(rad) / 2, y1: 0.5 - Math.sin(rad) / 2, x2: 0.5 + Math.cos(rad) / 2, y2: 0.5 + Math.sin(rad) / 2 }
            : { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r1: 0, r2: 0.6 };
        o.set(
          prop,
          new Gradient({
            type: fm.mode,
            gradientUnits: 'percentage',
            coords,
            colorStops: [
              { offset: 0, color: fm.c1 },
              { offset: 1, color: fm.c2 },
            ],
          }),
        );
      }
      o.dirty = true;
    }
    this.canvas.requestRenderAll();
    this.bumpSel();
    this.commitDebounced();
  }

  setCornerRadius(o: AnyObj, r: number) {
    o.cornerRadius = r;
    if (o instanceof Rect && !(o instanceof EffectRegion)) {
      o.set({ rx: r, ry: r });
      return;
    }
    if (o instanceof EffectRegion) {
      o.set({ rx: r, ry: r });
      return;
    }
    if (o instanceof FabricImage) {
      if (r > 0) {
        o.clipPath = new Rect({
          width: o.width,
          height: o.height,
          rx: r / (o.scaleX || 1),
          ry: r / (o.scaleY || 1),
          originX: 'center',
          originY: 'center',
          left: 0,
          top: 0,
        });
      } else o.clipPath = undefined;
      o.dirty = true;
    }
  }

  private pendingAdjust: { imgs: (FabricImage & AnyObj)[]; adj: Partial<Adjustments> } | null = null;
  private adjustFrame = 0;

  setAdjust(adj: Partial<Adjustments>, commit: 'now' | 'debounce' = 'debounce', targets?: AnyObj[]) {
    const imgs = (targets ?? this.expandSelection()).filter((o) => o instanceof FabricImage) as (FabricImage & AnyObj)[];
    // record values immediately so the UI reflects them, apply the (expensive) filters once per frame
    for (const img of imgs) img.adjust = { ...normalizeAdjust(img.adjust), ...adj };
    this.pendingAdjust = { imgs, adj: { ...(this.pendingAdjust?.adj || {}), ...adj } };
    const flush = () => {
      this.adjustFrame = 0;
      const p = this.pendingAdjust;
      this.pendingAdjust = null;
      if (!p) return;
      for (const img of p.imgs) applyAdjustments(img, img.adjust || {});
      this.canvas.requestRenderAll();
    };
    this.bumpSel();
    if (commit === 'now') {
      cancelAnimationFrame(this.adjustFrame);
      flush();
      this.commit('Adjust');
    } else {
      if (!this.adjustFrame) this.adjustFrame = requestAnimationFrame(flush);
      this.commitDebounced();
    }
  }

  resetAdjust() {
    const imgs = this.expandSelection().filter((o) => o instanceof FabricImage) as (FabricImage & AnyObj)[];
    imgs.forEach((i) => applyAdjustments(i, {}));
    this.canvas.requestRenderAll();
    this.bumpSel();
    this.commit('Reset adjustments');
  }

  // ---------------------------------------------------------------- layer ops
  selectLayer(id: string, additive = false) {
    const o = this.byId(id);
    if (!o) return;
    if (this.store.tool !== 'select') useStore.getState().setTool('select');
    if (!o.visible) return;
    if (additive) {
      const cur = this.activeObjects().filter((x) => x !== o);
      const has = this.activeObjects().includes(o);
      const list = has ? cur : [...cur, o];
      this.canvas.discardActiveObject();
      if (list.length === 1) this.canvas.setActiveObject(list[0]);
      else if (list.length > 1) this.canvas.setActiveObject(new ActiveSelection(list, { canvas: this.canvas }));
    } else {
      this.canvas.setActiveObject(o);
    }
    this.canvas.requestRenderAll();
  }

  selectAllLayers() {
    const objs = this.objects().filter((o) => o.visible && !o.locked);
    this.canvas.discardActiveObject();
    if (objs.length === 1) this.canvas.setActiveObject(objs[0]);
    else if (objs.length) this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
  }

  deselect() {
    this.canvas.discardActiveObject();
    this.clearPixelSelection();
    this.canvas.requestRenderAll();
  }

  deleteSelected() {
    const objs = this.activeObjects().filter((o) => !o.locked);
    if (!objs.length) return;
    this.canvas.discardActiveObject();
    objs.forEach((o) => this.canvas.remove(o));
    this.commit('Delete');
  }

  deleteLayer(id: string) {
    const o = this.byId(id);
    if (!o) return;
    if (this.activeObjects().includes(o)) this.canvas.discardActiveObject();
    this.canvas.remove(o);
    this.commit('Delete layer');
  }

  setLayerProp(id: string, props: Record<string, any>) {
    const o = this.byId(id);
    if (!o) return;
    o.set(props);
    if ('locked' in props) {
      o.locked = props.locked;
      this.applyLock(o);
    }
    if (props.visible === false && this.activeObjects().includes(o)) this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.commit('Layer property');
  }

  renameLayer(id: string, name: string) {
    const o = this.byId(id);
    if (!o) return;
    o.name = name;
    this.commit('Rename layer');
  }

  /** Move layer to absolute stacking index (0 = bottom) */
  moveLayerTo(id: string, index: number) {
    const o = this.byId(id);
    if (!o) return;
    const all = this.canvas.getObjects();
    index = Math.max(0, Math.min(all.length - 1, index));
    this.canvas.moveObjectTo(o, index);
    this.canvas.requestRenderAll();
    this.commit('Reorder layer');
  }

  arrange(dir: 'forward' | 'backward' | 'front' | 'back') {
    const objs = this.activeObjects();
    if (!objs.length) return;
    const c = this.canvas;
    const sorted = [...objs].sort((a, b) => c.getObjects().indexOf(a) - c.getObjects().indexOf(b));
    if (dir === 'front') sorted.forEach((o) => c.bringObjectToFront(o));
    else if (dir === 'back') [...sorted].reverse().forEach((o) => c.sendObjectToBack(o));
    else if (dir === 'forward') [...sorted].reverse().forEach((o) => c.bringObjectForward(o));
    else sorted.forEach((o) => c.sendObjectBackwards(o));
    c.requestRenderAll();
    this.commit('Arrange');
  }

  async duplicate() {
    const objs = this.activeObjects();
    if (!objs.length) return;
    const clones: AnyObj[] = [];
    for (const o of objs) {
      const cl = (await o.clone(CUSTOM_PROPS)) as AnyObj;
      cl.id = uid();
      cl.name = (o.name || 'Layer') + ' copy';
      const m = o.group ? util.multiplyTransformMatrices(o.group.calcTransformMatrix(), o.calcOwnMatrix()) : null;
      if (m) util.applyTransformToObject(cl, m);
      cl.set({ left: (cl.left || 0) + 20, top: (cl.top || 0) + 20 });
      clones.push(cl);
    }
    this.canvas.discardActiveObject();
    clones.forEach((c) => this.add(c, { select: false }));
    if (clones.length === 1) this.canvas.setActiveObject(clones[0]);
    else this.canvas.setActiveObject(new ActiveSelection(clones, { canvas: this.canvas }));
    this.commit('Duplicate');
  }

  groupSelected() {
    const objs = this.activeObjects();
    if (objs.length < 2) return;
    const c = this.canvas;
    const idx = Math.min(...objs.map((o) => c.getObjects().indexOf(o)));
    c.discardActiveObject();
    objs.forEach((o) => c.remove(o));
    const g = new Group(objs) as AnyObj;
    this.add(g, { name: 'Group', layerType: 'group', index: idx });
    this.commit('Group');
  }

  ungroupSelected() {
    const g = this.active();
    if (!(g instanceof Group) || g instanceof ActiveSelection || (g as any).layerType === 'counter') return;
    const c = this.canvas;
    const idx = c.getObjects().indexOf(g);
    const items = (g as Group).removeAll() as AnyObj[];
    c.remove(g);
    items.forEach((o, i) => {
      this.add(o, { select: false, index: idx + i });
      o.setCoords();
    });
    c.setActiveObject(new ActiveSelection(items, { canvas: c }));
    c.requestRenderAll();
    this.commit('Ungroup');
  }

  nudge(dx: number, dy: number) {
    const o = this.active();
    if (!o || o.locked) return;
    o.set({ left: (o.left || 0) + dx, top: (o.top || 0) + dy });
    o.setCoords();
    this.canvas.requestRenderAll();
    this.bumpSel();
    this.commitDebounced();
  }

  align(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const objs = this.activeObjects();
    const target = this.active();
    if (!target) return;
    // align to document if a single object, else to selection bounds
    const single = objs.length === 1;
    const items = single ? [target] : objs;
    const ref = single
      ? { left: 0, top: 0, width: this.doc.width, height: this.doc.height }
      : (() => {
          const bs = items.map((o) => absBounds(o));
          const l = Math.min(...bs.map((b) => b.left)), t = Math.min(...bs.map((b) => b.top));
          const r = Math.max(...bs.map((b) => b.left + b.width)), btm = Math.max(...bs.map((b) => b.top + b.height));
          return { left: l, top: t, width: r - l, height: btm - t };
        })();
    if (!single) {
      // items inside ActiveSelection: temporarily drop selection to work in scene coords
      this.canvas.discardActiveObject();
    }
    for (const o of items) {
      const b = absBounds(o);
      let dx = 0, dy = 0;
      if (how === 'left') dx = ref.left - b.left;
      if (how === 'right') dx = ref.left + ref.width - (b.left + b.width);
      if (how === 'hcenter') dx = ref.left + ref.width / 2 - (b.left + b.width / 2);
      if (how === 'top') dy = ref.top - b.top;
      if (how === 'bottom') dy = ref.top + ref.height - (b.top + b.height);
      if (how === 'vcenter') dy = ref.top + ref.height / 2 - (b.top + b.height / 2);
      o.set({ left: (o.left || 0) + dx, top: (o.top || 0) + dy });
      o.setCoords();
    }
    if (!single) this.canvas.setActiveObject(new ActiveSelection(items, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.commit('Align');
  }

  flipSelected(axis: 'x' | 'y') {
    const objs = this.activeObjects();
    if (!objs.length) return;
    const a = this.active()!;
    if (axis === 'x') a.set('flipX', !a.flipX);
    else a.set('flipY', !a.flipY);
    this.canvas.requestRenderAll();
    this.commit('Flip layer');
  }

  rotateSelected(deg: number) {
    const a = this.active();
    if (!a) return;
    a.rotate(((a.angle || 0) + deg) % 360);
    a.setCoords();
    this.canvas.requestRenderAll();
    this.commit('Rotate layer');
  }

  // ---------------------------------------------------------------- clipboard
  async copy(cut = false) {
    const objs = this.activeObjects();
    if (!objs.length) {
      if (this.selMask) return this.copySelectionPixels();
      return;
    }
    const a = this.active()!;
    this.clipboard = [];
    if (a instanceof ActiveSelection) {
      const m = a.calcTransformMatrix();
      for (const o of objs) {
        const cl = await o.clone(CUSTOM_PROPS);
        util.applyTransformToObject(cl, util.multiplyTransformMatrices(m, o.calcOwnMatrix()));
        this.clipboard.push(cl.toObject(CUSTOM_PROPS));
      }
    } else this.clipboard.push(a.toObject(CUSTOM_PROPS));
    this.clipboardStamp = 'photomahnoor:' + uid();
    try {
      await navigator.clipboard.writeText(this.clipboardStamp);
    } catch {
      /* clipboard may be unavailable */
    }
    if (cut) this.deleteSelected();
    this.store.toast(cut ? 'Cut' : 'Copied');
  }

  async pasteInternal() {
    if (!this.clipboard) return false;
    const objs = await util.enlivenObjects<AnyObj>(this.clipboard);
    this.canvas.discardActiveObject();
    for (const o of objs) {
      o.id = uid();
      o.set({ left: (o.left || 0) + 16, top: (o.top || 0) + 16 });
      this.add(o, { select: false });
    }
    // update clipboard so repeated pastes cascade
    this.clipboard = objs.map((o) => o.toObject(CUSTOM_PROPS));
    if (objs.length === 1) this.canvas.setActiveObject(objs[0]);
    else this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.commit('Paste');
    return true;
  }

  async handlePaste(e: ClipboardEvent) {
    const dt = e.clipboardData;
    if (!dt) return;
    const text = dt.getData('text/plain');
    if (text && text === this.clipboardStamp && this.clipboard) {
      e.preventDefault();
      await this.pasteInternal();
      return;
    }
    const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      for (const it of Array.from(dt.items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    if (files.length) {
      e.preventDefault();
      for (const f of files) await this.addImageFromBlob(f, { name: f.name || 'Pasted image' });
      return;
    }
    if (this.clipboard && !text) {
      e.preventDefault();
      await this.pasteInternal();
      return;
    }
    if (text) {
      e.preventDefault();
      this.addText(text.slice(0, 500));
    }
  }

  /** Copy the selected layers (or whole document) as PNG to the system clipboard */
  async copyAsImage() {
    try {
      const objs = this.activeObjects();
      let canvas: HTMLCanvasElement;
      if (objs.length) {
        const a = this.active()!;
        const b = absBounds(a);
        const full = await this.renderDoc({ scale: 1, only: objs.map((o) => o.id!) });
        canvas = createCanvas(b.width, b.height);
        ctx2d(canvas).drawImage(full, -b.left, -b.top);
      } else canvas = await this.renderDoc({ scale: 1 });
      const blob = await canvasToBlob(canvas, 'image/png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.store.toast('Image copied to clipboard', 'success');
    } catch (err) {
      this.store.toast('Clipboard image copy not permitted by this browser', 'error');
    }
  }

  // ---------------------------------------------------------------- history
  snapshot(): Snapshot {
    const json = this.canvas.toObject(CUSTOM_PROPS) as any;
    return { doc: { ...this.doc }, objects: json.objects };
  }

  resetHistory() {
    this.history = [this.snapshot()];
    this.hIndex = 0;
    this.updateHistoryFlags();
    this.queueSync();
  }

  commitDebounced() {
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit('Edit'), 350);
  }

  commit(_label = 'Edit') {
    if (this.restoring) return;
    window.clearTimeout(this.commitTimer);
    this.commitTimer = undefined;
    this.history = this.history.slice(0, this.hIndex + 1);
    this.history.push(this.snapshot());
    if (this.history.length > 80) this.history.shift();
    this.hIndex = this.history.length - 1;
    this.changeCounter++;
    this.compositeCache = null;
    this.updateHistoryFlags();
    useStore.setState({ dirty: true });
    this.queueSync();
    this.scheduleThumbs();
    this.onCommit?.();
  }

  private updateHistoryFlags() {
    useStore.setState({ canUndo: this.hIndex > 0, canRedo: this.hIndex < this.history.length - 1 });
  }

  async undo() {
    if (this.commitTimer) this.commit('Edit');
    if (this.hIndex <= 0) return;
    this.hIndex--;
    await this.restore(this.history[this.hIndex]);
  }

  async redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    await this.restore(this.history[this.hIndex]);
  }

  private async restore(s: Snapshot) {
    this.restoring = true;
    const selIds = this.activeObjects().map((o) => o.id);
    if (this.cropRect) this.cancelCrop();
    const sizeChanged = s.doc.width !== this.doc.width || s.doc.height !== this.doc.height;
    try {
      await this.loadObjects(s.objects);
      this.doc = { ...s.doc };
      useStore.setState({ doc: this.doc });
      if (sizeChanged) this.clearPixelSelection();
      const sel = this.objects().filter((o) => selIds.includes(o.id));
      if (sel.length === 1) this.canvas.setActiveObject(sel[0]);
      this.canvas.requestRenderAll();
    } finally {
      this.restoring = false;
      this.compositeCache = null;
      this.changeCounter++;
      this.updateHistoryFlags();
      this.queueSync();
      this.scheduleThumbs();
      useStore.setState({ dirty: true });
      this.onCommit?.();
    }
  }

  private async loadObjects(objects: any[]) {
    const c = this.canvas;
    const objs = await util.enlivenObjects<AnyObj>(objects);
    c.discardActiveObject();
    c.remove(...c.getObjects());
    for (const o of objs) {
      this.applyLock(o);
      if (o instanceof FabricImage && (o as any).adjust && !o.filters?.length) applyAdjustments(o, (o as any).adjust);
    }
    if (objs.length) c.add(...objs);
    // fonts
    const fonts = new Set<string>();
    const walk = (o: any) => {
      if (o.fontFamily) fonts.add(o.fontFamily);
      o._objects?.forEach(walk);
    };
    objs.forEach(walk);
    fonts.forEach((f) =>
      ensureFont(f).then(() => {
        objs.forEach((o: any) => o.initDimensions?.());
        c.requestRenderAll();
      }),
    );
  }

  // ---------------------------------------------------------------- sync to UI
  queueSync() {
    if (this.syncQueued) return;
    this.syncQueued = true;
    requestAnimationFrame(() => {
      this.syncQueued = false;
      const layers: LayerInfo[] = this.objects()
        .map((o) => ({
          id: o.id!,
          name: o.name || this.defaultName(o),
          kind: this.kindOf(o),
          visible: o.visible !== false,
          locked: !!o.locked,
          opacity: o.opacity ?? 1,
        }))
        .reverse();
      useStore.setState({ layers, selectedIds: this.activeObjects().map((o) => o.id!).filter(Boolean) });
    });
  }

  private scheduleThumbs() {
    window.clearTimeout(this.thumbTimer);
    this.thumbTimer = window.setTimeout(() => this.makeThumbs(), 500);
  }

  private makeThumbs() {
    const thumbs: Record<string, string> = {};
    for (const o of this.objects()) {
      try {
        const b = o.getBoundingRect();
        const m = Math.min(1, 64 / Math.max(1, b.width, b.height)) * (1 / this.canvas.getZoom());
        const el = o.toCanvasElement({ multiplier: m * this.canvas.getZoom(), enableRetinaScaling: false } as any);
        thumbs[o.id!] = el.toDataURL('image/png');
      } catch {
        /* ignore */
      }
    }
    useStore.setState({ thumbs });
  }

  // ---------------------------------------------------------------- document ops
  newDocument(width: number, height: number, background: string | null = '#ffffff', name = 'Untitled', autoSize = false) {
    this.canvas.discardActiveObject();
    this.canvas.remove(...this.canvas.getObjects());
    this.doc = { width: Math.round(width), height: Math.round(height), background, cornerRadius: 0, name };
    this.autoSize = autoSize;
    this.projectId = uid();
    this.clearPixelSelection();
    useStore.setState({ doc: this.doc, dirty: false, started: true });
    useStore.getState().setOptions({ counterNext: 1 });
    this.resetHistory();
    this.fit();
  }

  setDoc(p: Partial<DocState>, commit = true) {
    this.doc = { ...this.doc, ...p };
    useStore.setState({ doc: this.doc });
    this.canvas.requestRenderAll();
    if (commit) this.commitDebounced();
  }

  private allTopLevel() {
    this.canvas.discardActiveObject();
    return this.objects();
  }

  /** Scale whole document (image size) */
  resizeDocument(w: number, h: number) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const sx = w / this.doc.width,
      sy = h / this.doc.height;
    for (const o of this.allTopLevel()) {
      o.set({
        left: (o.left || 0) * sx,
        top: (o.top || 0) * sy,
        scaleX: (o.scaleX || 1) * sx,
        scaleY: (o.scaleY || 1) * sy,
      });
      o.setCoords();
    }
    this.doc = { ...this.doc, width: w, height: h };
    this.afterDocGeometry('Resize image');
  }

  /** Change canvas size without scaling content. anchor 0..1 */
  resizeCanvas(w: number, h: number, ax = 0.5, ay = 0.5) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const dx = (w - this.doc.width) * ax,
      dy = (h - this.doc.height) * ay;
    this.translateAll(dx, dy);
    this.doc = { ...this.doc, width: w, height: h };
    this.afterDocGeometry('Canvas size');
  }

  private translateAll(dx: number, dy: number) {
    for (const o of this.allTopLevel()) {
      o.set({ left: (o.left || 0) + dx, top: (o.top || 0) + dy });
      o.setCoords();
    }
  }

  cropDocument(x: number, y: number, w: number, h: number) {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    this.translateAll(-x, -y);
    this.doc = { ...this.doc, width: w, height: h };
    this.afterDocGeometry('Crop');
  }

  rotateDocument(deg: 90 | -90 | 180) {
    const W = this.doc.width,
      H = this.doc.height;
    const nW = deg === 180 ? W : H,
      nH = deg === 180 ? H : W;
    const rad = (deg * Math.PI) / 180;
    for (const o of this.allTopLevel()) {
      const c = o.getCenterPoint();
      const rel = new Point(c.x - W / 2, c.y - H / 2).rotate(rad);
      o.rotate(((o.angle || 0) + deg + 360) % 360);
      o.setPositionByOrigin(new Point(rel.x + nW / 2, rel.y + nH / 2), 'center', 'center');
      o.setCoords();
    }
    this.doc = { ...this.doc, width: nW, height: nH };
    this.afterDocGeometry('Rotate');
  }

  flipDocument(axis: 'x' | 'y') {
    const W = this.doc.width,
      H = this.doc.height;
    for (const o of this.allTopLevel()) {
      const c = o.getCenterPoint();
      if (axis === 'x') {
        o.set({ flipX: !o.flipX, angle: -(o.angle || 0) });
        o.setPositionByOrigin(new Point(W - c.x, c.y), 'center', 'center');
      } else {
        o.set({ flipY: !o.flipY, angle: -(o.angle || 0) });
        o.setPositionByOrigin(new Point(c.x, H - c.y), 'center', 'center');
      }
      o.setCoords();
    }
    this.canvas.requestRenderAll();
    this.commit('Flip');
  }

  /** Fit the canvas to the bounds of the selected layer (or all content) */
  trimToContent() {
    const objs = this.activeObjects().length ? this.activeObjects() : this.objects().filter((o) => o.visible);
    if (!objs.length) return;
    const bs = objs.map((o) => absBounds(o));
    const l = Math.min(...bs.map((b) => b.left)),
      t = Math.min(...bs.map((b) => b.top));
    const r = Math.max(...bs.map((b) => b.left + b.width)),
      b2 = Math.max(...bs.map((b) => b.top + b.height));
    this.cropDocument(l, t, r - l, b2 - t);
  }

  private afterDocGeometry(label: string) {
    useStore.setState({ doc: this.doc });
    this.clearPixelSelection();
    this.fit();
    this.commit(label);
  }

  // ---------------------------------------------------------------- crop tool
  startCrop() {
    if (this.cropRect) return;
    this.canvas.discardActiveObject();
    const r = new Rect({
      left: 0,
      top: 0,
      width: this.doc.width,
      height: this.doc.height,
      fill: 'rgba(0,0,0,0)',
      stroke: '#ffffff',
      strokeWidth: 1,
      strokeUniform: true,
      strokeDashArray: [6, 4],
      lockRotation: true,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#111',
      cornerStyle: 'rect',
      borderColor: '#ffffff',
    }) as AnyObj;
    r.setControlVisible('mtr', false);
    r.isTemp = true;
    r.excludeFromExport = true;
    this.cropRect = r as Rect;
    this.canvas.skipTargetFind = false;
    this.objects().forEach((o) => {
      (o as any)._wasEvented = o.evented;
      o.evented = false;
    });
    this.canvas.add(r);
    this.canvas.setActiveObject(r);
    this.setCropAspect(this.store.options.cropAspect);
    this.canvas.requestRenderAll();
  }

  setCropAspect(aspect: string) {
    const r = this.cropRect;
    if (!r) return;
    if (aspect === 'free') {
      r.set({ lockUniScaling: false } as any);
      ['ml', 'mr', 'mt', 'mb'].forEach((k) => r.setControlVisible(k, true));
      this.canvas.uniformScaling = false;
    } else {
      const [aw, ah] = aspect.split(':').map(Number);
      const b = this.cropBox();
      let w = b.width,
        h = (b.width * ah) / aw;
      if (h > this.doc.height) {
        h = this.doc.height;
        w = (h * aw) / ah;
      }
      if (w > this.doc.width) {
        w = this.doc.width;
        h = (w * ah) / aw;
      }
      r.set({ width: w, height: h, scaleX: 1, scaleY: 1, left: (this.doc.width - w) / 2, top: (this.doc.height - h) / 2 });
      ['ml', 'mr', 'mt', 'mb'].forEach((k) => r.setControlVisible(k, false));
      this.canvas.uniformScaling = true;
    }
    r.setCoords();
    this.canvas.requestRenderAll();
  }

  applyCrop() {
    const r = this.cropRect;
    if (!r) return;
    const b = this.cropBox();
    this.cancelCrop();
    this.cropDocument(b.left, b.top, b.width, b.height);
    useStore.getState().setTool('select');
  }

  /** crop rectangle in doc coordinates (stroke excluded) */
  cropBox() {
    const r = this.cropRect!;
    return { left: r.left || 0, top: r.top || 0, width: (r.width || 0) * (r.scaleX || 1), height: (r.height || 0) * (r.scaleY || 1) };
  }

  cancelCrop() {
    if (!this.cropRect) return;
    this.canvas.remove(this.cropRect);
    this.cropRect = null;
    this.canvas.uniformScaling = true;
    this.objects().forEach((o) => {
      o.evented = (o as any)._wasEvented ?? true;
    });
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- rendering/export
  /** Render the document (or a subset of layers) into a canvas at `scale`. */
  async renderDoc(opts: { scale?: number; background?: string | null; only?: string[]; noRound?: boolean } = {}): Promise<HTMLCanvasElement> {
    const scale = opts.scale ?? 1;
    const W = Math.max(1, Math.round(this.doc.width * scale)),
      H = Math.max(1, Math.round(this.doc.height * scale));
    let objects = this.snapshot().objects;
    if (opts.only) objects = objects.filter((o: any) => opts.only!.includes(o.id));
    const el = createCanvas(W, H);
    const sc = new StaticCanvas(el, { width: W, height: H, enableRetinaScaling: false, renderOnAddRemove: false });
    const objs = await util.enlivenObjects<AnyObj>(objects);
    objs.forEach((o) => {
      if (o instanceof FabricImage && (o as any).adjust && !o.filters?.length) applyAdjustments(o, (o as any).adjust);
    });
    sc.add(...objs);
    sc.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    const bg = opts.background !== undefined ? opts.background : opts.only ? null : this.doc.background;
    if (bg) sc.backgroundColor = bg;
    EffectRegion.exporting = true;
    try {
      sc.renderAll();
    } finally {
      EffectRegion.exporting = false;
    }
    const out = sc.getElement() as HTMLCanvasElement;
    let result = out;
    if (this.doc.cornerRadius > 0 && !opts.noRound) {
      const rc = createCanvas(W, H);
      const x = rc.getContext('2d')!;
      x.beginPath();
      x.roundRect(0, 0, W, H, this.doc.cornerRadius * scale);
      x.clip();
      x.drawImage(out, 0, 0);
      result = rc;
    } else {
      const copy = createCanvas(W, H);
      copy.getContext('2d')!.drawImage(out, 0, 0);
      result = copy;
    }
    sc.dispose();
    return result;
  }

  async exportBlob(format: 'png' | 'jpeg' | 'webp', quality = 0.92, scale = 1): Promise<Blob> {
    const bg = format === 'jpeg' ? this.doc.background || '#ffffff' : this.doc.background;
    let c = await this.renderDoc({ scale, background: bg });
    if (format === 'jpeg') {
      // flatten rounded corners/transparency onto white
      const f = createCanvas(c.width, c.height);
      const x = f.getContext('2d')!;
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, f.width, f.height);
      x.drawImage(c, 0, 0);
      c = f;
    }
    return canvasToBlob(c, `image/${format}`, quality);
  }

  async composite(): Promise<ImageData> {
    if (this.compositeCache && this.compositeCache.key === this.changeCounter) return this.compositeCache.data;
    const c = await this.renderDoc({ scale: 1, noRound: true });
    const data = ctx2d(c).getImageData(0, 0, c.width, c.height);
    this.compositeCache = { key: this.changeCounter, data };
    return data;
  }

  async pickColor(p: Point, target: 'fill' | 'stroke') {
    const img = await this.composite();
    const x = Math.floor(p.x),
      y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const i = (y * img.width + x) * 4;
    const hex = '#' + [img.data[i], img.data[i + 1], img.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    useStore.getState().setOptions(target === 'fill' ? { fill: hex } : { stroke: hex });
    navigator.clipboard?.writeText(hex).catch(() => {});
    this.store.toast(`Picked ${hex} as ${target} colour (copied)`);
  }

  // ---------------------------------------------------------------- pixel selection
  private selModeFromEvent(e: MouseEvent): 'replace' | 'add' | 'subtract' {
    if (e.shiftKey) return 'add';
    if (e.altKey) return 'subtract';
    return this.store.options.selectMode;
  }

  combineMask(m: Uint8Array, mode: 'replace' | 'add' | 'subtract' | 'intersect') {
    const n = this.doc.width * this.doc.height;
    if (m.length !== n) return;
    if (mode === 'replace' || !this.selMask) {
      if (mode === 'subtract') return;
      this.selMask = m;
    } else {
      const s = this.selMask;
      for (let i = 0; i < n; i++) {
        if (mode === 'add') s[i] = s[i] || m[i] ? 255 : 0;
        else if (mode === 'subtract') s[i] = m[i] ? 0 : s[i];
        else s[i] = s[i] && m[i] ? 255 : 0;
      }
    }
    this.refreshSelDisplay();
  }

  selectRect(x: number, y: number, w: number, h: number, mode: 'replace' | 'add' | 'subtract' = 'replace') {
    const W = this.doc.width,
      H = this.doc.height;
    const m = new Uint8Array(W * H);
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) m.fill(255, yy * W + x0, yy * W + x1);
    this.combineMask(m, mode);
  }

  selectPolygon(pts: { x: number; y: number }[], mode: 'replace' | 'add' | 'subtract') {
    const W = this.doc.width,
      H = this.doc.height;
    const c = createCanvas(W, H);
    const x = ctx2d(c);
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    x.closePath();
    x.fillStyle = '#000';
    x.fill();
    const d = x.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 127 ? 255 : 0;
    this.combineMask(m, mode);
  }

  selectAllPixels() {
    this.selectRect(0, 0, this.doc.width, this.doc.height, 'replace');
  }

  invertSelection() {
    const n = this.doc.width * this.doc.height;
    if (!this.selMask) {
      this.selectAllPixels();
      return;
    }
    for (let i = 0; i < n; i++) this.selMask[i] = this.selMask[i] ? 0 : 255;
    this.refreshSelDisplay();
  }

  clearPixelSelection() {
    this.selMask = null;
    this.selDisplay = null;
    useStore.setState({ hasPixelSelection: false });
    this.canvas?.requestRenderAll();
  }

  async wandSelect(p: Point, mode: 'replace' | 'add' | 'subtract') {
    const img = await this.composite();
    const o = this.store.options;
    const m = floodSelect(img, p.x, p.y, o.wandTolerance, o.wandContiguous);
    this.combineMask(m, mode);
  }

  private brushStamp(p: Point, mode: 'add' | 'subtract') {
    const W = this.doc.width,
      H = this.doc.height;
    if (!this.selMask) this.selMask = new Uint8Array(W * H);
    const r = this.brushRadius();
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(W - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(H - 1, Math.ceil(p.y + r));
    const v = mode === 'add' ? 255 : 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r2) this.selMask[y * W + x] = v;
    // quick display update
    if (!this.selDisplay || this.selDisplay.width !== W) this.selDisplay = createCanvas(W, H);
    const x = this.selDisplay.getContext('2d')!;
    x.globalCompositeOperation = mode === 'add' ? 'source-over' : 'destination-out';
    x.fillStyle = 'rgba(59,130,246,0.45)';
    x.beginPath();
    x.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (mode === 'add') {
      x.globalCompositeOperation = 'destination-out';
      x.fill();
      x.globalCompositeOperation = 'source-over';
    }
    x.fill();
    x.globalCompositeOperation = 'source-over';
    useStore.setState({ hasPixelSelection: true });
  }

  refreshSelDisplay() {
    const m = this.selMask;
    const W = this.doc.width,
      H = this.doc.height;
    if (!m || !m.some((v) => v)) {
      this.clearPixelSelection();
      return;
    }
    const c = createCanvas(W, H);
    const x = ctx2d(c);
    const img = x.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx;
        if (!m[i]) continue;
        const edge =
          xx === 0 || y === 0 || xx === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W];
        const k = i * 4;
        if (edge) {
          const on = ((xx + y) >> 2) & 1;
          d[k] = d[k + 1] = d[k + 2] = on ? 255 : 0;
          d[k + 3] = 255;
        } else {
          d[k] = 59;
          d[k + 1] = 130;
          d[k + 2] = 246;
          d[k + 3] = 90;
        }
      }
    }
    x.putImageData(img, 0, 0);
    this.selDisplay = c;
    useStore.setState({ hasPixelSelection: true });
    this.canvas.requestRenderAll();
  }

  selectionBounds() {
    if (!this.selMask) return null;
    return maskBounds(this.selMask, this.doc.width, this.doc.height);
  }

  /** mask as a canvas (alpha = selection) in doc space */
  maskCanvas(feather = 0): HTMLCanvasElement | null {
    if (!this.selMask) return null;
    const W = this.doc.width,
      H = this.doc.height;
    const m = feather > 0 ? featherMask(this.selMask, W, H, feather) : this.selMask;
    const c = createCanvas(W, H);
    const x = ctx2d(c);
    const img = x.createImageData(W, H);
    for (let i = 0; i < W * H; i++) img.data[i * 4 + 3] = m[i];
    x.putImageData(img, 0, 0);
    return c;
  }

  private async addPatchLayer(canvas: HTMLCanvasElement, x: number, y: number, name: string, layerType = 'image', index?: number) {
    const blob = await canvasToBlob(canvas, 'image/png');
    const url = this.registerBlob(blob);
    const img = (await FabricImage.fromURL(url)) as AnyObj;
    img.set({ left: x, top: y, originX: 'left', originY: 'top' });
    this.add(img, { name, layerType, index });
    return img;
  }

  /** Extract selected pixels of the visible composite into a new layer */
  async extractSelection() {
    const b = this.selectionBounds();
    if (!b) return this.store.toast('Make a selection first', 'error');
    const comp = await this.renderDoc({ scale: 1, noRound: true, background: null });
    const mask = this.maskCanvas(0.6)!;
    const c = createCanvas(b.w, b.h);
    const x = ctx2d(c);
    x.drawImage(comp, -b.x, -b.y);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mask, -b.x, -b.y);
    await this.addPatchLayer(c, b.x, b.y, 'Extracted');
    this.clearPixelSelection();
    this.commit('Extract selection');
  }

  async copySelectionPixels() {
    const b = this.selectionBounds();
    if (!b) return;
    const comp = await this.renderDoc({ scale: 1, noRound: true, background: null });
    const c = createCanvas(b.w, b.h);
    const x = ctx2d(c);
    x.drawImage(comp, -b.x, -b.y);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(this.maskCanvas()!, -b.x, -b.y);
    try {
      const blob = await canvasToBlob(c);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.store.toast('Selection copied as image', 'success');
    } catch {
      this.store.toast('Clipboard not available', 'error');
    }
  }

  async fillSelection(color: string) {
    const b = this.selectionBounds();
    if (!b) return this.store.toast('Make a selection first', 'error');
    const c = createCanvas(b.w, b.h);
    const x = ctx2d(c);
    x.drawImage(this.maskCanvas(0.6)!, -b.x, -b.y);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, b.w, b.h);
    await this.addPatchLayer(c, b.x, b.y, 'Fill');
    this.commit('Fill selection');
  }

  async effectSelection(kind: 'blur' | 'pixelate', amount = 14) {
    const b = this.selectionBounds();
    if (!b) return this.store.toast('Make a selection first', 'error');
    const comp = await this.renderDoc({ scale: 1, noRound: true, background: null });
    const pad = amount * 2;
    const bx = Math.max(0, b.x - pad), by = Math.max(0, b.y - pad);
    const bw = Math.min(this.doc.width - bx, b.w + pad * 2), bh = Math.min(this.doc.height - by, b.h + pad * 2);
    const c = createCanvas(bw, bh);
    const x = ctx2d(c);
    x.drawImage(comp, -bx, -by);
    if (kind === 'blur') {
      const d = x.getImageData(0, 0, bw, bh);
      boxBlur(d, amount, 3);
      x.putImageData(d, 0, 0);
    } else {
      const s = createCanvas(Math.max(1, bw / amount), Math.max(1, bh / amount));
      s.getContext('2d')!.drawImage(c, 0, 0, s.width, s.height);
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, bw, bh);
      x.drawImage(s, 0, 0, bw, bh);
    }
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(this.maskCanvas(0.6)!, -bx, -by);
    await this.addPatchLayer(c, bx, by, kind === 'blur' ? 'Blurred area' : 'Pixelated area');
    this.clearPixelSelection();
    this.commit(kind);
  }

  /** Remove the selected object by inpainting – result is a non-destructive patch layer */
  async removeObject() {
    const b0 = this.selectionBounds();
    if (!b0) return this.store.toast('Paint or select the object to remove first', 'error');
    const W = this.doc.width,
      H = this.doc.height;
    useStore.setState({ busy: { message: 'Removing object…' } });
    await new Promise((r) => setTimeout(r, 30));
    try {
      const comp = await this.renderDoc({ scale: 1, noRound: true, background: this.doc.background });
      const margin = Math.round(Math.max(24, Math.max(b0.w, b0.h) * 0.6));
      const rx = Math.max(0, b0.x - margin), ry = Math.max(0, b0.y - margin);
      const rw = Math.min(W - rx, b0.w + margin * 2), rh = Math.min(H - ry, b0.h + margin * 2);
      const full = dilate(this.selMask!, W, H, 3);
      // region scale to keep it fast
      const s = Math.min(1, 480 / Math.max(rw, rh));
      const sw = Math.max(1, Math.round(rw * s)), sh = Math.max(1, Math.round(rh * s));
      const rc = createCanvas(sw, sh);
      const rctx = ctx2d(rc);
      rctx.imageSmoothingQuality = 'high';
      rctx.drawImage(comp, rx, ry, rw, rh, 0, 0, sw, sh);
      const regionImg = rctx.getImageData(0, 0, sw, sh);
      // build scaled mask
      const mc = createCanvas(rw, rh);
      const mctx = ctx2d(mc);
      const mimg = mctx.createImageData(rw, rh);
      for (let y = 0; y < rh; y++)
        for (let x = 0; x < rw; x++) mimg.data[(y * rw + x) * 4 + 3] = full[(y + ry) * W + x + rx];
      mctx.putImageData(mimg, 0, 0);
      const msc = createCanvas(sw, sh);
      const msctx = ctx2d(msc);
      msctx.drawImage(mc, 0, 0, sw, sh);
      const md = msctx.getImageData(0, 0, sw, sh).data;
      const smask = new Uint8Array(sw * sh);
      for (let i = 0; i < sw * sh; i++) smask[i] = md[i * 4 + 3] > 20 ? 255 : 0;
      inpaint(regionImg, s < 1 ? dilate(smask, sw, sh, 1) : smask);
      rctx.putImageData(regionImg, 0, 0);
      // upscale fill and keep only masked area (feathered)
      const out = createCanvas(rw, rh);
      const octx = ctx2d(out);
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(rc, 0, 0, rw, rh);
      const feathered = featherMask(full, W, H, 2);
      const fm = createCanvas(rw, rh);
      const fctx = ctx2d(fm);
      const fimg = fctx.createImageData(rw, rh);
      for (let y = 0; y < rh; y++)
        for (let x = 0; x < rw; x++) fimg.data[(y * rw + x) * 4 + 3] = Math.max(feathered[(y + ry) * W + x + rx], full[(y + ry) * W + x + rx]);
      fctx.putImageData(fimg, 0, 0);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(fm, 0, 0);
      await this.addPatchLayer(out, rx, ry, 'Object removal patch', 'patch');
      this.clearPixelSelection();
      this.canvas.discardActiveObject();
      this.commit('Remove object');
      this.store.toast('Object removed (as a patch layer – hide or delete it to undo)', 'success');
    } catch (e) {
      console.error(e);
      this.store.toast('Object removal failed: ' + (e as Error).message, 'error');
    } finally {
      useStore.setState({ busy: null });
    }
  }

  /** Erase selected pixels from the active image layer (destructive to that layer, undoable) */
  async deleteSelectionFromLayer() {
    const img = this.active();
    if (!(img instanceof FabricImage)) return this.store.toast('Select an image layer first', 'error');
    if (!this.selMask) return this.store.toast('Make a selection first', 'error');
    const el = (img as any)._originalElement || img.getElement();
    const w = el.naturalWidth || el.width,
      h = el.naturalHeight || el.height;
    const c = createCanvas(w, h);
    const x = ctx2d(c);
    x.drawImage(el, 0, 0);
    // element pixel -> doc transform
    const m = util.multiplyTransformMatrices(img.calcTransformMatrix(), [1, 0, 0, 1, -img.width / 2 - (img.cropX || 0), -img.height / 2 - (img.cropY || 0)]);
    const inv = util.invertTransform(m);
    x.save();
    x.setTransform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(this.maskCanvas(0.6)!, 0, 0);
    x.restore();
    const blob = await canvasToBlob(c);
    await this.replaceImageElement(img as FabricImage, blob);
    this.clearPixelSelection();
    this.commit('Delete pixels');
  }

  async replaceImageElement(img: FabricImage, blob: Blob) {
    const url = this.registerBlob(blob);
    const { width, height, cropX, cropY } = img;
    await img.setSrc(url);
    img.set({ width, height, cropX, cropY });
    const a = (img as AnyObj).adjust;
    if (a) applyAdjustments(img, a);
    img.dirty = true;
    this.canvas.requestRenderAll();
  }

  setMaskFromAlpha(alpha: Uint8Array, mode: 'replace' | 'add' | 'subtract' = 'replace') {
    const m = new Uint8Array(alpha.length);
    for (let i = 0; i < alpha.length; i++) m[i] = alpha[i] > 127 ? 255 : 0;
    this.combineMask(m, mode);
  }

  // ---------------------------------------------------------------- screenshot frame
  async frameScreenshot(opts: { padding: number; radius: number; shadow: boolean; c1: string; c2: string; angle: number }) {
    let img = this.active();
    if (!img) img = this.objects().find((o) => o instanceof FabricImage) ?? null;
    if (!img) return this.store.toast('Add an image first', 'error');
    this.canvas.discardActiveObject();
    const b = absBounds(img);
    const pad = opts.padding;
    // shrink canvas around the image plus padding
    this.cropDocument(b.left - pad, b.top - pad, b.width + pad * 2, b.height + pad * 2);
    const bg = new Rect({ left: 0, top: 0, width: this.doc.width, height: this.doc.height, strokeWidth: 0, fill: opts.c1 }) as AnyObj;
    this.add(bg, { name: 'Background', layerType: 'shape', index: 0, select: false });
    this.setFillMode({ mode: 'linear', c1: opts.c1, c2: opts.c2, angle: opts.angle }, [bg]);
    if (img instanceof FabricImage) this.setCornerRadius(img, opts.radius);
    if (opts.shadow) img.shadow = new Shadow({ color: 'rgba(0,0,0,0.35)', blur: 40, offsetX: 0, offsetY: 16 });
    img.dirty = true;
    this.canvas.requestRenderAll();
    this.commit('Screenshot frame');
  }

  // ---------------------------------------------------------------- projects
  async toProject(): Promise<ProjectFile> {
    if (this.commitTimer) this.commit();
    const snap = this.snapshot();
    const assets: Record<string, string> = {};
    const urlToId = new Map<string, string>();
    const { blobToDataURL } = await import('../lib/imageOps');
    const fix = async (o: any) => {
      if (o.src && typeof o.src === 'string' && o.src.startsWith('blob:')) {
        let id = urlToId.get(o.src);
        if (!id) {
          id = uid();
          urlToId.set(o.src, id);
          const blob = this.assets.get(o.src) ?? (await (await fetch(o.src)).blob());
          assets[id] = await blobToDataURL(blob);
        }
        o.src = 'asset:' + id;
      }
      if (o.objects) for (const ch of o.objects) await fix(ch);
      if (o.clipPath) await fix(o.clipPath);
    };
    const objects = structuredClone(snap.objects);
    for (const o of objects) await fix(o);
    return { app: 'photomahnoor', version: 1, doc: snap.doc, objects, assets };
  }

  async loadProject(p: ProjectFile, projectId?: string) {
    if (!p || p.app !== 'photomahnoor' || !Array.isArray(p.objects)) throw new Error('Not a PhotoMahnoor project file');
    const idToUrl = new Map<string, string>();
    const { dataURLToBlob } = await import('../lib/imageOps');
    for (const [id, data] of Object.entries(p.assets || {})) {
      const blob = typeof data === 'string' ? await dataURLToBlob(data) : (data as Blob);
      idToUrl.set(id, this.registerBlob(blob));
    }
    const fix = (o: any) => {
      if (typeof o.src === 'string' && o.src.startsWith('asset:')) o.src = idToUrl.get(o.src.slice(6)) || o.src;
      o.objects?.forEach(fix);
      if (o.clipPath) fix(o.clipPath);
    };
    const objects = structuredClone(p.objects);
    objects.forEach(fix);
    this.restoring = true;
    try {
      await this.loadObjects(objects);
    } finally {
      this.restoring = false;
    }
    this.doc = { ...{ cornerRadius: 0, name: 'Untitled', background: '#ffffff' }, ...p.doc };
    this.autoSize = false;
    this.projectId = projectId || uid();
    this.clearPixelSelection();
    useStore.setState({ doc: this.doc, started: true, dirty: false });
    this.resetHistory();
    this.changeCounter++;
    this.scheduleThumbs();
    this.fit();
  }
}

export function absBounds(o: FabricObject) {
  const b = o.getBoundingRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}

export function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const editor = new Editor();
(window as any).__editor = editor;
