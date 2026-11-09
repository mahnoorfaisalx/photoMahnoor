import { useState } from 'react';
import { FabricImage } from 'fabric';
import { editor } from '../editor/editor';
import { useStore } from '../store';
import { Section, Slider, Toggle } from './ui';
import { ADJUST_PRESETS, normalizeAdjust, type Adjustments, DEFAULT_ADJUST } from '../editor/adjustments';
import { customLooks } from '../editor/presets';

const SLIDERS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
];
const DETAIL: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 100 },
  { key: 'noise', label: 'Grain', min: 0, max: 100 },
  { key: 'pixelate', label: 'Pixelate', min: 0, max: 50 },
];

export function AdjustPanel() {
  useStore((s) => s.selVersion);
  const [looks, setLooks] = useState(customLooks.list());
  const imgs = editor.canvas ? (editor.activeObjects().filter((o) => o instanceof FabricImage) as any[]) : [];
  const allImgs = editor.canvas ? (editor.objects().filter((o) => o instanceof FabricImage && o.visible) as any[]) : [];
  if (!imgs.length) {
    return (
      <div className="panel-scroll pad">
        <p className="muted">Select an image layer to adjust brightness, contrast, saturation, temperature, sharpness and more.</p>
        {allImgs.length > 0 && (
          <button className="btn primary" onClick={() => editor.selectLayer(allImgs[allImgs.length - 1].id)}>
            Select top image
          </button>
        )}
        <p className="muted small">All adjustments are non-destructive: the original pixels are always kept and you can reset at any time.</p>
      </div>
    );
  }
  const a = normalizeAdjust(imgs[0].adjust);
  const set = (p: Partial<Adjustments>, commit: 'now' | 'debounce' = 'debounce') => editor.setAdjust(p, commit);
  const applyLook = (adj: Partial<Adjustments>) => editor.setAdjust({ ...DEFAULT_ADJUST, ...adj }, 'now');
  return (
    <div className="panel-scroll" data-testid="adjust-panel">
      <Section title="Looks">
        <div className="looks">
          {ADJUST_PRESETS.map((p) => (
            <button key={p.name} className="chip" onClick={() => applyLook(p.adjust)} data-testid={`look-${p.name}`}>{p.name}</button>
          ))}
          {looks.map((p) => (
            <button key={'c' + p.name} className="chip custom" title="Right-click to delete" onClick={() => applyLook(p.adjust)} onContextMenu={(e) => { e.preventDefault(); customLooks.remove(p.name); setLooks(customLooks.list()); }}>{p.name}</button>
          ))}
          <button className="chip add" onClick={() => { const n = prompt('Save current adjustments as look:'); if (n) { customLooks.add(n, a); setLooks(customLooks.list()); } }}>+ Save look</button>
        </div>
      </Section>
      <Section title="Light & colour" right={<button className="link" onClick={() => editor.resetAdjust()}>Reset</button>}>
        {SLIDERS.map((s) => (
          <Slider key={s.key} testId={`adj-${s.key}`} label={s.label} min={s.min} max={s.max} value={a[s.key] as number} onChange={(v) => set({ [s.key]: v })} />
        ))}
      </Section>
      <Section title="Detail">
        {DETAIL.map((s) => (
          <Slider key={s.key} testId={`adj-${s.key}`} label={s.label} min={s.min} max={s.max} value={a[s.key] as number} onChange={(v) => set({ [s.key]: v })} />
        ))}
      </Section>
      <Section title="Filters">
        <div className="btn-row wrap">
          <Toggle checked={a.grayscale} onChange={(v) => set({ grayscale: v }, 'now')} label="Black & white" />
          <Toggle checked={a.sepia} onChange={(v) => set({ sepia: v }, 'now')} label="Sepia" />
          <Toggle checked={a.vintage} onChange={(v) => set({ vintage: v }, 'now')} label="Vintage" />
          <Toggle checked={a.invert} onChange={(v) => set({ invert: v }, 'now')} label="Invert" />
        </div>
      </Section>
      {allImgs.length > 1 && (
        <div className="pad">
          <button className="btn" onClick={() => editor.setAdjust(a, 'now', allImgs)}>Apply these settings to all images</button>
        </div>
      )}
    </div>
  );
}
