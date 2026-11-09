import { getItem } from '../lib/storage';
// AI features: background removal, subject selection, background replacement.
// Primary engine: @imgly/background-removal (ISNet via onnxruntime-web, runs fully in the browser,
// model files fetched from the imgly CDN on first use). Fallback: local colour-key segmentation.
import { FabricImage, Rect, util } from 'fabric';
import { editor } from './editor';
import { useStore } from '../store';
import { createCanvas, ctx2d, quickBackgroundMask, canvasToBlob, loadImage } from '../lib/imageOps';

export type BgEngine = 'ai' | 'quick';

let aiFailed = false;

function setBusy(message: string, progress?: number) {
  useStore.setState({ busy: { message, progress } });
}

/** Run the AI model on a blob. Returns a PNG blob with alpha, or throws. */
export async function aiRemoveBackground(blob: Blob): Promise<Blob> {
  const mod = await import('@imgly/background-removal');
  const quality = (getItem('pm.aiModel') as any) || 'isnet_fp16';
  return mod.removeBackground(blob, {
    model: quality,
    output: { format: 'image/png' },
    progress: (key: string, cur: number, total: number) => {
      const pct = total ? Math.round((cur / total) * 100) : undefined;
      setBusy(key.startsWith('fetch') ? 'Downloading AI model (first time only)…' : 'Running AI model…', pct);
    },
  } as any);
}

/** Fallback: colour-key segmentation from the image borders */
export async function quickRemoveBackground(blob: Blob, tolerance = 18): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const c = createCanvas(img.naturalWidth, img.naturalHeight);
    const x = ctx2d(c);
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const alpha = quickBackgroundMask(d, tolerance);
    for (let i = 0; i < alpha.length; i++) d.data[i * 4 + 3] = Math.min(d.data[i * 4 + 3], alpha[i]);
    x.putImageData(d, 0, 0);
    return canvasToBlob(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function removeBackgroundBlob(blob: Blob, engine: BgEngine): Promise<{ blob: Blob; engine: BgEngine }> {
  if (engine === 'ai' && !aiFailed) {
    try {
      const out = await aiRemoveBackground(blob);
      return { blob: out, engine: 'ai' };
    } catch (e) {
      console.warn('AI background removal failed, using quick fallback', e);
      aiFailed = true;
      useStore.getState().toast('AI model unavailable (offline or blocked) – used quick colour-based removal instead', 'error');
    }
  }
  const out = await quickRemoveBackground(blob);
  return { blob: out, engine: 'quick' };
}

/** Get the original (unfiltered, uncropped) pixels of an image layer as a blob */
async function imageLayerBlob(img: FabricImage): Promise<Blob> {
  const el = ((img as any)._originalElement || img.getElement()) as HTMLImageElement | HTMLCanvasElement;
  const w = (el as HTMLImageElement).naturalWidth || el.width;
  const h = (el as HTMLImageElement).naturalHeight || el.height;
  const c = createCanvas(w, h);
  ctx2d(c).drawImage(el, 0, 0);
  return canvasToBlob(c);
}

/** Remove the background of the selected (or first) image layer, non-destructively. */
export async function removeBackgroundFromLayer(engine: BgEngine = 'ai') {
  const st = useStore.getState();
  let img = editor.active() as any;
  if (!(img instanceof FabricImage)) img = editor.objects().find((o) => o instanceof FabricImage && o.visible);
  if (!(img instanceof FabricImage)) {
    st.toast('Add or select an image layer first', 'error');
    return null;
  }
  setBusy(engine === 'ai' ? 'Preparing AI background removal…' : 'Removing background…');
  try {
    const src = await imageLayerBlob(img);
    const { blob, engine: used } = await removeBackgroundBlob(src, engine);
    const url = editor.registerBlob(blob);
    const cut = (await img.clone(['id', 'name', 'layerType', 'adjust', 'cornerRadius'])) as any;
    await cut.setSrc(url);
    cut.set({ width: img.width, height: img.height, cropX: img.cropX, cropY: img.cropY });
    if (img.filters?.length) {
      cut.filters = img.filters;
      cut.applyFilters();
    }
    cut.id = undefined;
    cut.name = (img as any).name ? `${(img as any).name} (cutout)` : 'Cutout';
    const idx = editor.canvas.getObjects().indexOf(img);
    (img as any).name = ((img as any).name || 'Image') + ' (original)';
    img.set({ visible: false });
    editor.canvas.discardActiveObject();
    editor.add(cut, { index: idx + 1, layerType: 'image' });
    editor.commit('Remove background');
    st.toast(`Background removed${used === 'quick' ? ' (quick mode)' : ''}. Original kept as a hidden layer.`, 'success');
    return cut as FabricImage;
  } catch (e) {
    console.error(e);
    st.toast('Background removal failed: ' + (e as Error).message, 'error');
    return null;
  } finally {
    useStore.setState({ busy: null });
  }
}

/** Smart select: select the main subject of the visible composite. */
export async function selectSubject(engine: BgEngine = 'ai') {
  setBusy('Finding subject…');
  try {
    const comp = await editor.renderDoc({ scale: 1, noRound: true });
    const blob = await canvasToBlob(comp);
    const { blob: cut } = await removeBackgroundBlob(blob, engine);
    const url = URL.createObjectURL(cut);
    const im = await loadImage(url);
    URL.revokeObjectURL(url);
    const c = createCanvas(editor.doc.width, editor.doc.height);
    const x = ctx2d(c);
    x.drawImage(im, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const alpha = new Uint8Array(c.width * c.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
    editor.setMaskFromAlpha(alpha);
    useStore.getState().setTool('select');
    useStore.getState().toast('Subject selected. Use the Selection panel to extract, remove or fill it.', 'success');
  } catch (e) {
    useStore.getState().toast('Subject selection failed: ' + (e as Error).message, 'error');
  } finally {
    useStore.setState({ busy: null });
  }
}

export type BgReplacement =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; c1: string; c2: string; angle: number }
  | { kind: 'image'; file: Blob }
  | { kind: 'blur'; amount: number }
  | { kind: 'transparent' };

/** Replace the background behind a subject: removes background (if needed) and inserts a new layer below. */
export async function replaceBackground(rep: BgReplacement, engine: BgEngine = 'ai') {
  let cut = editor.active() as any;
  const isCutout = cut instanceof FabricImage && /cutout/i.test(String((cut as any).name || ''));
  const original = isCutout
    ? editor.objects().find((o) => o instanceof FabricImage && !o.visible && /original/i.test(String((o as any).name || '')))
    : (cut instanceof FabricImage ? cut : editor.objects().find((o) => o instanceof FabricImage));
  if (!isCutout) {
    cut = await removeBackgroundFromLayer(engine);
    if (!cut) return;
  }
  const W = editor.doc.width,
    H = editor.doc.height;
  const idx = editor.canvas.getObjects().indexOf(cut);
  // remove a previously generated replacement background
  const prev = editor.objects().find((o) => (o as any).layerType === 'background');
  if (prev) editor.canvas.remove(prev);
  const insertAt = Math.max(0, editor.canvas.getObjects().indexOf(cut));
  void idx;
  if (rep.kind === 'transparent') {
    editor.setDoc({ background: null }, false);
  } else if (rep.kind === 'color' || rep.kind === 'gradient') {
    const r = new Rect({ left: 0, top: 0, width: W, height: H, strokeWidth: 0, fill: rep.kind === 'color' ? rep.color : '#fff' });
    editor.add(r as any, { name: 'New background', layerType: 'background', index: insertAt, select: false });
    if (rep.kind === 'gradient') editor.setFillMode({ mode: 'linear', c1: rep.c1, c2: rep.c2, angle: rep.angle }, [r as any]);
  } else if (rep.kind === 'image') {
    const url = editor.registerBlob(rep.file);
    const im = await FabricImage.fromURL(url);
    const s = Math.max(W / im.width, H / im.height);
    im.set({ originX: 'center', originY: 'center', left: W / 2, top: H / 2, scaleX: s, scaleY: s });
    editor.add(im as any, { name: 'New background', layerType: 'background', index: insertAt, select: false });
  } else if (rep.kind === 'blur' && original) {
    const cl = (await (original as any).clone(['adjust'])) as FabricImage;
    cl.set({ visible: true });
    const { applyAdjustments, normalizeAdjust } = await import('./adjustments');
    applyAdjustments(cl, { ...normalizeAdjust((original as any).adjust), blur: rep.amount });
    editor.add(cl as any, { name: 'Blurred background', layerType: 'background', index: insertAt, select: false });
  }
  editor.canvas.setActiveObject(cut);
  editor.canvas.requestRenderAll();
  editor.commit('Replace background');
  void util;
}
