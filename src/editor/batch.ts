// Batch image processing pipeline (runs entirely in the browser) → ZIP download
import { StaticCanvas, FabricImage } from 'fabric';
import JSZip from 'jszip';
import { buildFilters, normalizeAdjust, type Adjustments } from './adjustments';
import { removeBackgroundBlob, type BgEngine } from './ai';
import { createCanvas, canvasToBlob, loadImage } from '../lib/imageOps';

export interface BatchRecipe {
  resizeMode: 'none' | 'fit' | 'exact' | 'percent' | 'cover';
  width: number;
  height: number;
  percent: number;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  adjust: Partial<Adjustments>;
  removeBg: 'none' | BgEngine;
  bgColor: string | null;
  cornerRadius: number;
  padding: number;
  padColor: string;
  watermark: string;
  watermarkPos: 'br' | 'bl' | 'tr' | 'tl' | 'c';
  watermarkSize: number; // % of width
  watermarkOpacity: number;
  watermarkColor: string;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
  naming: string; // e.g. {name}-edited
}

export const DEFAULT_RECIPE: BatchRecipe = {
  resizeMode: 'none',
  width: 1080,
  height: 1080,
  percent: 50,
  rotate: 0,
  flipH: false,
  flipV: false,
  adjust: {},
  removeBg: 'none',
  bgColor: null,
  cornerRadius: 0,
  padding: 0,
  padColor: '#ffffff',
  watermark: '',
  watermarkPos: 'br',
  watermarkSize: 4,
  watermarkOpacity: 0.7,
  watermarkColor: '#ffffff',
  format: 'jpeg',
  quality: 0.9,
  naming: '{name}-edited',
};

function resizeHQ(src: HTMLCanvasElement, w: number, h: number) {
  let cur = src;
  // step down by halves for quality
  while (cur.width / 2 > w && cur.height / 2 > h) {
    const n = createCanvas(cur.width / 2, cur.height / 2);
    const x = n.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  const out = createCanvas(w, h);
  const x = out.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return out;
}

export async function processOne(file: Blob, r: BatchRecipe): Promise<Blob> {
  let blob: Blob = file;
  if (r.removeBg !== 'none') blob = (await removeBackgroundBlob(blob, r.removeBg)).blob;
  const url = URL.createObjectURL(blob);
  let canvas: HTMLCanvasElement;
  try {
    const el = await loadImage(url);
    const w = el.naturalWidth,
      h = el.naturalHeight;
    // 1. adjustments via the same Fabric filter pipeline as the editor
    const a = normalizeAdjust(r.adjust);
    const sc = new StaticCanvas(createCanvas(w, h), { width: w, height: h, enableRetinaScaling: false, renderOnAddRemove: false });
    const img = new FabricImage(el, { left: 0, top: 0, originX: 'left', originY: 'top' });
    img.filters = buildFilters(a);
    img.applyFilters();
    sc.add(img);
    sc.renderAll();
    canvas = createCanvas(w, h);
    canvas.getContext('2d')!.drawImage(sc.getElement(), 0, 0);
    sc.dispose();
  } finally {
    URL.revokeObjectURL(url);
  }
  // 2. rotate / flip
  if (r.rotate || r.flipH || r.flipV) {
    const swap = r.rotate === 90 || r.rotate === 270;
    const n = createCanvas(swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
    const x = n.getContext('2d')!;
    x.translate(n.width / 2, n.height / 2);
    x.rotate((r.rotate * Math.PI) / 180);
    x.scale(r.flipH ? -1 : 1, r.flipV ? -1 : 1);
    x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    canvas = n;
  }
  // 3. resize
  const cw = canvas.width,
    ch = canvas.height;
  if (r.resizeMode === 'fit') {
    const s = Math.min(r.width / cw, r.height / ch, 1);
    if (s < 1) canvas = resizeHQ(canvas, Math.round(cw * s), Math.round(ch * s));
  } else if (r.resizeMode === 'exact') {
    canvas = resizeHQ(canvas, r.width, r.height);
  } else if (r.resizeMode === 'percent') {
    canvas = resizeHQ(canvas, Math.max(1, Math.round((cw * r.percent) / 100)), Math.max(1, Math.round((ch * r.percent) / 100)));
  } else if (r.resizeMode === 'cover') {
    const s = Math.max(r.width / cw, r.height / ch);
    const tmp = resizeHQ(canvas, Math.round(cw * s), Math.round(ch * s));
    const out = createCanvas(r.width, r.height);
    out.getContext('2d')!.drawImage(tmp, -(tmp.width - r.width) / 2, -(tmp.height - r.height) / 2);
    canvas = out;
  }
  // 4. corners, padding, background
  {
    const pad = r.padding;
    const n = createCanvas(canvas.width + pad * 2, canvas.height + pad * 2);
    const x = n.getContext('2d')!;
    if (pad > 0) {
      x.fillStyle = r.padColor;
      x.fillRect(0, 0, n.width, n.height);
    }
    x.save();
    if (r.cornerRadius > 0) {
      x.beginPath();
      x.roundRect(pad, pad, canvas.width, canvas.height, r.cornerRadius);
      x.clip();
    }
    if (r.bgColor) {
      x.fillStyle = r.bgColor;
      x.fillRect(pad, pad, canvas.width, canvas.height);
    }
    x.drawImage(canvas, pad, pad);
    x.restore();
    canvas = n;
  }
  // 5. watermark
  if (r.watermark.trim()) {
    const x = canvas.getContext('2d')!;
    const size = Math.max(10, (canvas.width * r.watermarkSize) / 100);
    x.font = `600 ${size}px Inter, Arial, sans-serif`;
    x.globalAlpha = r.watermarkOpacity;
    x.fillStyle = r.watermarkColor;
    x.shadowColor = 'rgba(0,0,0,0.4)';
    x.shadowBlur = size / 6;
    const m = size * 0.8;
    const tw = x.measureText(r.watermark).width;
    let px = canvas.width - tw - m,
      py = canvas.height - m;
    if (r.watermarkPos === 'bl') px = m;
    if (r.watermarkPos === 'tl') { px = m; py = m + size; }
    if (r.watermarkPos === 'tr') py = m + size;
    if (r.watermarkPos === 'c') { px = (canvas.width - tw) / 2; py = canvas.height / 2 + size / 3; }
    x.fillText(r.watermark, px, py);
    x.globalAlpha = 1;
  }
  // 6. encode
  if (r.format === 'jpeg') {
    const f = createCanvas(canvas.width, canvas.height);
    const x = f.getContext('2d')!;
    x.fillStyle = r.bgColor || r.padColor || '#ffffff';
    x.fillRect(0, 0, f.width, f.height);
    x.drawImage(canvas, 0, 0);
    canvas = f;
  }
  return canvasToBlob(canvas, `image/${r.format}`, r.quality);
}

export function outputName(file: File, r: BatchRecipe, index: number) {
  const base = file.name.replace(/\.[^.]+$/, '');
  const ext = r.format === 'jpeg' ? 'jpg' : r.format;
  const name = (r.naming || '{name}').replace(/\{name\}/g, base).replace(/\{n\}/g, String(index + 1).padStart(3, '0'));
  return `${name}.${ext}`;
}

export async function runBatch(
  files: File[],
  r: BatchRecipe,
  onProgress: (done: number, total: number, current: string) => void,
): Promise<{ zip: Blob; errors: string[]; outputs: { name: string; blob: Blob }[] }> {
  const zip = new JSZip();
  const errors: string[] = [];
  const outputs: { name: string; blob: Blob }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress(i, files.length, f.name);
    try {
      const out = await processOne(f, r);
      let name = outputName(f, r, i);
      while (used.has(name)) name = name.replace(/(\.\w+)$/, `-${i + 1}$1`);
      used.add(name);
      zip.file(name, out);
      outputs.push({ name, blob: out });
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  onProgress(files.length, files.length, '');
  const blob = await zip.generateAsync({ type: 'blob' });
  return { zip: blob, errors, outputs };
}
