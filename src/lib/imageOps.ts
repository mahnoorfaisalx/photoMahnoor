// Pixel-level helpers: blur, flood fill (magic wand), inpainting, colour-key background removal

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

/** In-place separable box blur, `passes` iterations (3 ≈ gaussian). */
export function boxBlur(img: ImageData, radius: number, passes = 3) {
  const r = Math.max(1, Math.min(radius, 200));
  const { width: w, height: h, data } = img;
  const tmp = new Uint8ClampedArray(data.length);
  for (let p = 0; p < passes; p++) {
    blurLine(data, tmp, w, h, r, true);
    blurLine(tmp, data, w, h, r, false);
  }
}

function blurLine(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const div = r * 2 + 1;
  for (let l = 0; l < lines; l++) {
    let sr = 0,
      sg = 0,
      sb = 0,
      sa = 0;
    const idx = (i: number) => {
      const c = i < 0 ? 0 : i >= len ? len - 1 : i;
      return horizontal ? (l * w + c) * 4 : (c * w + l) * 4;
    };
    for (let i = -r; i <= r; i++) {
      const k = idx(i);
      sr += src[k];
      sg += src[k + 1];
      sb += src[k + 2];
      sa += src[k + 3];
    }
    for (let i = 0; i < len; i++) {
      const o = idx(i);
      dst[o] = sr / div;
      dst[o + 1] = sg / div;
      dst[o + 2] = sb / div;
      dst[o + 3] = sa / div;
      const a = idx(i - r);
      const b = idx(i + r + 1);
      sr += src[b] - src[a];
      sg += src[b + 1] - src[a + 1];
      sb += src[b + 2] - src[a + 2];
      sa += src[b + 3] - src[a + 3];
    }
  }
}

/** Magic-wand: returns mask (0/255) of pixels similar to the seed colour. */
export function floodSelect(
  img: ImageData,
  sx: number,
  sy: number,
  tolerance: number,
  contiguous = true,
): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask;
  const si = (sy * w + sx) * 4;
  const r0 = data[si],
    g0 = data[si + 1],
    b0 = data[si + 2],
    a0 = data[si + 3];
  const tol = (tolerance / 100) * 441.7; // max rgb distance
  const tol2 = tol * tol;
  const similar = (i: number) => {
    const k = i * 4;
    const da = data[k + 3] - a0;
    const dr = data[k] - r0,
      dg = data[k + 1] - g0,
      db = data[k + 2] - b0;
    return dr * dr + dg * dg + db * db + da * da <= tol2;
  };
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (similar(i)) mask[i] = 255;
    return mask;
  }
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = sy * w + sx;
  mask[sy * w + sx] = 255;
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  function push(j: number) {
    if (mask[j]) return;
    if (similar(j)) {
      mask[j] = 255;
      stack[sp++] = j;
    }
  }
  return mask;
}

/** Bounding box of non-zero mask values */
export function maskBounds(mask: Uint8Array | Uint8ClampedArray, w: number, h: number, stride = 1, offset = 0) {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[(row + x) * stride + offset] > 127) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Morphological dilation of a binary mask by r pixels (square-ish). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) last = x; else if (x - last <= r) tmp[y * w + x] = 255;
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) { last = x; tmp[y * w + x] = 255; } else if (last - x <= r) tmp[y * w + x] = 255;
    }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) if (tmp[y * w + x]) last = y; else if (y - last <= r) out[y * w + x] = 255;
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) { last = y; out[y * w + x] = 255; } else if (last - y <= r) out[y * w + x] = 255;
    }
  }
  return out;
}

/**
 * Inpaint masked region of `img` (in place). Multi-scale harmonic fill
 * followed by patch-based texture synthesis on the finest level.
 */
export function inpaint(img: ImageData, mask: Uint8Array) {
  const { width: w, height: h } = img;
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = mask[i] > 127 ? 0 : 1;
  const levels: { data: Float32Array; known: Uint8Array; w: number; h: number }[] = [];
  let cur = { data: toFloat(img), known, w, h };
  levels.push(cur);
  while (cur.w > 24 && cur.h > 24) {
    cur = downsample(cur);
    levels.push(cur);
  }
  // coarsest: fill unknown with mean of known then diffuse
  const top = levels[levels.length - 1];
  initMean(top);
  diffuse(top, 200);
  for (let l = levels.length - 2; l >= 0; l--) {
    const fine = levels[l];
    const coarse = levels[l + 1];
    for (let y = 0; y < fine.h; y++) {
      for (let x = 0; x < fine.w; x++) {
        const i = y * fine.w + x;
        if (fine.known[i]) continue;
        const cx = Math.min(coarse.w - 1, x >> 1);
        const cy = Math.min(coarse.h - 1, y >> 1);
        const ci = (cy * coarse.w + cx) * 4;
        for (let c = 0; c < 4; c++) fine.data[i * 4 + c] = coarse.data[ci + c];
      }
    }
    diffuse(fine, l === 0 ? 40 : 60);
  }
  const base = levels[0];
  patchRefine(base, 3);
  const out = img.data;
  for (let i = 0; i < w * h; i++) {
    if (known[i]) continue;
    for (let c = 0; c < 4; c++) out[i * 4 + c] = base.data[i * 4 + c];
  }
}

function toFloat(img: ImageData) {
  const f = new Float32Array(img.data.length);
  for (let i = 0; i < f.length; i++) f[i] = img.data[i];
  return f;
}

function downsample(l: { data: Float32Array; known: Uint8Array; w: number; h: number }) {
  const w = Math.max(1, l.w >> 1);
  const h = Math.max(1, l.h >> 1);
  const data = new Float32Array(w * h * 4);
  const known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      const acc = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(l.w - 1, x * 2 + dx);
          const sy = Math.min(l.h - 1, y * 2 + dy);
          const si = sy * l.w + sx;
          if (!l.known[si]) continue;
          n++;
          for (let c = 0; c < 4; c++) acc[c] += l.data[si * 4 + c];
        }
      const i = y * w + x;
      if (n >= 3) {
        known[i] = 1;
        for (let c = 0; c < 4; c++) data[i * 4 + c] = acc[c] / n;
      }
    }
  }
  return { data, known, w, h };
}

function initMean(l: { data: Float32Array; known: Uint8Array; w: number; h: number }) {
  const acc = [0, 0, 0, 0];
  let n = 0;
  for (let i = 0; i < l.w * l.h; i++)
    if (l.known[i]) {
      n++;
      for (let c = 0; c < 4; c++) acc[c] += l.data[i * 4 + c];
    }
  if (!n) {
    acc.fill(255);
    n = 1;
  }
  for (let i = 0; i < l.w * l.h; i++)
    if (!l.known[i]) for (let c = 0; c < 4; c++) l.data[i * 4 + c] = acc[c] / n;
}

function diffuse(l: { data: Float32Array; known: Uint8Array; w: number; h: number }, iters: number) {
  const { w, h, data, known } = l;
  const unknown: number[] = [];
  for (let i = 0; i < w * h; i++) if (!known[i]) unknown.push(i);
  for (let it = 0; it < iters; it++) {
    for (const i of unknown) {
      const x = i % w;
      const y = (i - x) / w;
      let n = 0;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      const add = (j: number) => {
        const k = j * 4;
        r += data[k];
        g += data[k + 1];
        b += data[k + 2];
        a += data[k + 3];
        n++;
      };
      if (x > 0) add(i - 1);
      if (x < w - 1) add(i + 1);
      if (y > 0) add(i - w);
      if (y < h - 1) add(i + w);
      const k = i * 4;
      data[k] = r / n;
      data[k + 1] = g / n;
      data[k + 2] = b / n;
      data[k + 3] = a / n;
    }
  }
}

/** Replace smooth fill with best-matching known texture patches (random search). */
function patchRefine(l: { data: Float32Array; known: Uint8Array; w: number; h: number }, iters: number) {
  const { w, h, data, known } = l;
  const P = 3; // patch radius
  const unknown: number[] = [];
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < w * h; i++)
    if (!known[i]) {
      unknown.push(i);
      const x = i % w, y = (i - x) / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  if (!unknown.length || unknown.length > 160000) return;
  // candidate source positions: known pixels whose whole patch is known, near the hole
  const margin = Math.max(30, Math.max(maxX - minX, maxY - minY));
  const sx0 = Math.max(P, minX - margin), sx1 = Math.min(w - P - 1, maxX + margin);
  const sy0 = Math.max(P, minY - margin), sy1 = Math.min(h - P - 1, maxY + margin);
  const cands: number[] = [];
  for (let y = sy0; y <= sy1; y += 1)
    for (let x = sx0; x <= sx1; x += 1) {
      let ok = true;
      for (let dy = -P; dy <= P && ok; dy += P)
        for (let dx = -P; dx <= P; dx += P) if (!known[(y + dy) * w + x + dx]) { ok = false; break; }
      if (ok) cands.push(y * w + x);
    }
  if (cands.length < 20) return;
  const guide = new Float32Array(data); // smooth fill used as guide
  const nnf = new Int32Array(w * h).fill(-1);
  const dist = (ti: number, si: number) => {
    const tx = ti % w, ty = (ti - tx) / w;
    const sx = si % w, sy = (si - sx) / w;
    let d = 0;
    for (let dy = -P; dy <= P; dy++) {
      const yy = ty + dy, sy2 = sy + dy;
      if (yy < 0 || yy >= h || sy2 < 0 || sy2 >= h) continue;
      for (let dx = -P; dx <= P; dx++) {
        const xx = tx + dx, sx2 = sx + dx;
        if (xx < 0 || xx >= w || sx2 < 0 || sx2 >= w) continue;
        const a = (yy * w + xx) * 4, b = (sy2 * w + sx2) * 4;
        const src = known[yy * w + xx] ? data : guide;
        const wgt = known[yy * w + xx] ? 2 : 1;
        for (let c = 0; c < 3; c++) {
          const e = src[a + c] - data[b + c];
          d += e * e * wgt;
        }
      }
    }
    return d;
  };
  const best = new Float32Array(w * h).fill(Infinity);
  for (const i of unknown) {
    const s = cands[(Math.random() * cands.length) | 0];
    nnf[i] = s;
    best[i] = dist(i, s);
  }
  for (let it = 0; it < iters; it++) {
    const order = it % 2 === 0 ? unknown : [...unknown].reverse();
    const step = it % 2 === 0 ? 1 : -1;
    for (const i of order) {
      const x = i % w;
      // propagation from neighbour
      const nbs = [i - step, i - step * w];
      for (const nb of nbs) {
        if (nb < 0 || nb >= w * h || (step === 1 && x === 0 && nb === i - 1)) continue;
        const ns = nnf[nb];
        if (ns < 0) continue;
        const cand = ns + (i - nb);
        if (cand < 0 || cand >= w * h || !known[cand]) continue;
        const d = dist(i, cand);
        if (d < best[i]) { best[i] = d; nnf[i] = cand; }
      }
      // random search
      for (let k = 0; k < 4; k++) {
        const c = cands[(Math.random() * cands.length) | 0];
        const d = dist(i, c);
        if (d < best[i]) { best[i] = d; nnf[i] = c; }
      }
    }
    // update colours from matched patches (blend with guide for stability)
    for (const i of unknown) {
      const s = nnf[i];
      for (let c = 0; c < 4; c++) data[i * 4 + c] = data[s * 4 + c] * 0.85 + guide[i * 4 + c] * 0.15;
    }
  }
}

/** Colour-key background removal: floods from image borders using similar colours. Returns alpha mask 0..255 */
export function quickBackgroundMask(img: ImageData, tolerance = 18): Uint8Array {
  const { width: w, height: h, data } = img;
  const bg = new Uint8Array(w * h);
  const tol = (tolerance / 100) * 441.7;
  const tol2 = tol * tol;
  const stack: number[] = [];
  const seeds: number[] = [];
  for (let x = 0; x < w; x++) seeds.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) seeds.push(y * w, y * w + w - 1);
  for (const s of seeds) {
    if (bg[s]) continue;
    if (data[s * 4 + 3] < 10) { bg[s] = 255; stack.push(s); continue; }
    bg[s] = 255;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      const k = i * 4;
      const tryP = (j: number) => {
        if (bg[j]) return;
        const q = j * 4;
        const dr = data[q] - data[k], dg = data[q + 1] - data[k + 1], db = data[q + 2] - data[k + 2];
        // compare against neighbour (gradient) and against seed colour for robustness
        const sd = (data[q] - data[s * 4]) ** 2 + (data[q + 1] - data[s * 4 + 1]) ** 2 + (data[q + 2] - data[s * 4 + 2]) ** 2;
        if (dr * dr + dg * dg + db * db <= tol2 / 6 && sd <= tol2 * 2) {
          bg[j] = 255;
          stack.push(j);
        }
      };
      if (x > 0) tryP(i - 1);
      if (x < w - 1) tryP(i + 1);
      if (y > 0) tryP(i - w);
      if (y < h - 1) tryP(i + w);
    }
  }
  // alpha = inverse of bg, slightly feathered
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = bg[i] ? 0 : 255;
  return featherMask(alpha, w, h, 1);
}

export function featherMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = mask[i];
  boxBlur(img, r, 2);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = img.data[i * 4 + 3];
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, quality));
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not load image'));
    img.src = src;
  });
}

export function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function dataURLToBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  return r.blob();
}
