// Custom Fabric object classes used by the editor (arrows/lines, blur & pixelate regions)
import {
  FabricObject,
  Rect,
  Control,
  Point,
  util,
  classRegistry,
  type TPointerEvent,
  type Transform,
} from 'fabric';
import { boxBlur } from '../lib/imageOps';

/** Custom properties serialized on every object */
export const CUSTOM_PROPS = [
  'id',
  'name',
  'layerType',
  'locked',
  'adjust',
  'cornerRadius',
  'fillMode',
];

FabricObject.customProperties = CUSTOM_PROPS;

// ---------------------------------------------------------------------------
// Arrow / Line with draggable end points
// ---------------------------------------------------------------------------

export class Arrow extends FabricObject {
  static type = 'Arrow';
  declare x1: number;
  declare y1: number;
  declare x2: number;
  declare y2: number;
  declare headStart: boolean;
  declare headEnd: boolean;
  declare headScale: number;

  constructor(options: Record<string, unknown> = {}) {
    super();
    this.x1 = -50;
    this.y1 = 0;
    this.x2 = 50;
    this.y2 = 0;
    this.headStart = false;
    this.headEnd = true;
    this.headScale = 1;
    this.stroke = '#ff3b30';
    this.strokeWidth = 6;
    this.fill = null as unknown as string;
    this.strokeLineCap = 'round';
    this.strokeLineJoin = 'round';
    this.objectCaching = false;
    this.perPixelTargetFind = true;
    this.originX = 'center';
    this.originY = 'center';
    this.setOptions(options);
    this.updateDims();
    this.setupControls();
  }

  headLength() {
    return Math.max(10, this.strokeWidth * 3.2) * (this.headScale || 1);
  }

  updateDims() {
    const pad = this.headLength();
    this.width = Math.abs(this.x2 - this.x1) + pad;
    this.height = Math.abs(this.y2 - this.y1) + pad;
  }

  /** Re-center local points around 0,0 keeping absolute position */
  normalize() {
    const cx = (this.x1 + this.x2) / 2;
    const cy = (this.y1 + this.y2) / 2;
    if (Math.abs(cx) > 1e-6 || Math.abs(cy) > 1e-6) {
      const world = util.transformPoint(new Point(cx, cy), this.calcTransformMatrix());
      this.x1 -= cx;
      this.x2 -= cx;
      this.y1 -= cy;
      this.y2 -= cy;
      this.updateDims();
      this.setPositionByOrigin(world, 'center', 'center');
    } else {
      this.updateDims();
    }
    this.setCoords();
  }

  setupControls() {
    const mk = (which: 1 | 2) =>
      new Control({
        cursorStyle: 'crosshair',
        actionName: 'modifyLine',
        positionHandler: (_dim, finalMatrix, obj) => {
          const o = obj as Arrow;
          const p = which === 1 ? new Point(o.x1, o.y1) : new Point(o.x2, o.y2);
          const vpt = o.canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];
          void finalMatrix;
          return util.transformPoint(
            p,
            util.multiplyTransformMatrices(vpt, o.calcTransformMatrix()),
          );
        },
        actionHandler: (_e: TPointerEvent, transform: Transform, x: number, y: number) => {
          const o = transform.target as Arrow;
          const inv = util.invertTransform(o.calcTransformMatrix());
          const local = util.transformPoint(new Point(x, y), inv);
          if (which === 1) {
            o.x1 = local.x;
            o.y1 = local.y;
          } else {
            o.x2 = local.x;
            o.y2 = local.y;
          }
          o.normalize();
          return true;
        },
        render: (ctx, left, top) => {
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(left, top, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        },
      });
    this.controls = { p1: mk(1), p2: mk(2) };
    this.hasBorders = false;
  }

  drawHead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
    const ang = Math.atan2(toY - fromY, toX - fromX);
    const len = this.headLength();
    const spread = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - len * Math.cos(ang - spread), toY - len * Math.sin(ang - spread));
    ctx.lineTo(toX - len * Math.cos(ang + spread), toY - len * Math.sin(ang + spread));
    ctx.closePath();
    ctx.fill();
  }

  _render(ctx: CanvasRenderingContext2D) {
    const { x1, y1, x2, y2 } = this;
    const color = (this.stroke as string) || '#000';
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const shorten = this.headLength() * 0.8;
    let sx = x1,
      sy = y1,
      ex = x2,
      ey = y2;
    if (this.headEnd && dist > shorten) {
      ex = x2 - ux * shorten;
      ey = y2 - uy * shorten;
    }
    if (this.headStart && dist > shorten * 2) {
      sx = x1 + ux * shorten;
      sy = y1 + uy * shorten;
    }
    ctx.save();
    ctx.lineWidth = this.strokeWidth;
    ctx.lineCap = this.strokeLineCap;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (this.strokeDashArray && this.strokeDashArray.length) {
      ctx.setLineDash(this.strokeDashArray);
    }
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';
    if (this.headEnd) this.drawHead(ctx, x1, y1, x2, y2);
    if (this.headStart) this.drawHead(ctx, x2, y2, x1, y1);
    ctx.restore();
  }

  toObject(propertiesToInclude: any[] = []): any {
    return {
      ...super.toObject(propertiesToInclude as any),
      x1: this.x1,
      y1: this.y1,
      x2: this.x2,
      y2: this.y2,
      headStart: this.headStart,
      headEnd: this.headEnd,
      headScale: this.headScale,
    };
  }

  static async fromObject(obj: Record<string, unknown>): Promise<any> {
    const { type: _t, ...rest } = obj;
    void _t;
    return new Arrow(rest);
  }
}
classRegistry.setClass(Arrow);
classRegistry.setClass(Arrow, 'arrow');

// ---------------------------------------------------------------------------
// Effect region: live blur / pixelate of whatever lies beneath
// ---------------------------------------------------------------------------

export type EffectKind = 'blur' | 'pixelate';

let effectTemp: HTMLCanvasElement | null = null;
let effectTemp2: HTMLCanvasElement | null = null;

export class EffectRegion extends Rect {
  static type = 'EffectRegion';
  declare effect: EffectKind;
  declare strength: number;
  /** When true the outline is hidden (export rendering) */
  static exporting = false;

  constructor(options: Record<string, unknown> = {}) {
    super();
    this.effect = 'pixelate';
    this.strength = 12;
    this.fill = 'rgba(0,0,0,0)';
    this.stroke = null as unknown as string;
    this.strokeWidth = 0;
    this.objectCaching = false;
    this.setOptions(options as any);
  }

  _render(ctx: CanvasRenderingContext2D) {
    const w = this.width;
    const h = this.height;
    const m = ctx.getTransform();
    const pts = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const bx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
    const by = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
    const ex = Math.min(cw, Math.ceil(Math.max(...pts.map((p) => p.x))));
    const ey = Math.min(ch, Math.ceil(Math.max(...pts.map((p) => p.y))));
    const bw = ex - bx;
    const bh = ey - by;
    const scale = Math.hypot(m.a, m.b) || 1;
    if (bw >= 1 && bh >= 1) {
      let data: ImageData | null = null;
      try {
        data = ctx.getImageData(bx, by, bw, bh);
      } catch {
        data = null;
      }
      if (data) {
        if (!effectTemp) effectTemp = document.createElement('canvas');
        const t = effectTemp;
        const amount = Math.max(1, this.strength * scale);
        if (this.effect === 'pixelate') {
          t.width = bw;
          t.height = bh;
          t.getContext('2d')!.putImageData(data, 0, 0);
          if (!effectTemp2) effectTemp2 = document.createElement('canvas');
          const s = effectTemp2;
          const sw = Math.max(1, Math.round(bw / amount));
          const sh = Math.max(1, Math.round(bh / amount));
          s.width = sw;
          s.height = sh;
          const sctx = s.getContext('2d')!;
          sctx.imageSmoothingEnabled = true;
          sctx.drawImage(t, 0, 0, sw, sh);
          const tctx = t.getContext('2d')!;
          tctx.imageSmoothingEnabled = false;
          tctx.clearRect(0, 0, bw, bh);
          tctx.drawImage(s, 0, 0, sw, sh, 0, 0, bw, bh);
        } else {
          boxBlur(data, Math.round(amount), 3);
          t.width = bw;
          t.height = bh;
          t.getContext('2d')!.putImageData(data, 0, 0);
        }
        ctx.save();
        ctx.beginPath();
        const r = Math.min(this.rx || 0, w / 2, h / 2);
        if (r > 0 && ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r);
        else ctx.rect(-w / 2, -h / 2, w, h);
        ctx.clip();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(t, bx, by);
        ctx.restore();
      }
    }
    // dashed outline inside the editor so the region can be found
    if (!EffectRegion.exporting && this.canvas && (this.canvas as any).isInteractive) {
      ctx.save();
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = 'rgba(59,130,246,0.8)';
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  toObject(propertiesToInclude: any[] = []): any {
    return {
      ...super.toObject(propertiesToInclude as any),
      effect: this.effect,
      strength: this.strength,
    };
  }

  static async fromObject(obj: Record<string, unknown>): Promise<any> {
    const { type: _t, ...rest } = obj;
    void _t;
    return new EffectRegion(rest);
  }
}
classRegistry.setClass(EffectRegion);
classRegistry.setClass(EffectRegion, 'effectregion');
