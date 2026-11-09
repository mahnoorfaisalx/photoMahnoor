import { useState } from 'react';
import { FabricImage, FabricText, Gradient, ActiveSelection, Group } from 'fabric';
import { editor, type FillMode } from '../editor/editor';
import { Arrow, EffectRegion } from '../editor/objects';
import { useStore } from '../store';
import { ColorInput, NumberInput, Row, Section, Seg, Slider, Swatches, Toggle, toHex } from './ui';
import { FONT_LIST, TEXT_STYLES } from '../editor/shapes';
import { customTextStyles } from '../editor/presets';
import {
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Bold, Italic, Underline, Strikethrough,
  FlipHorizontal2, FlipVertical2, RotateCw, Copy, Trash2,
} from 'lucide-react';

const BLEND_MODES = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

function fillModeOf(o: any, prop: 'fill' | 'stroke' = 'fill'): FillMode {
  const v = o[prop];
  if (prop === 'fill' && o.fillMode && (o.fillMode.mode !== 'solid' || typeof v === 'string')) {
    if (o.fillMode.mode === 'solid') return { ...o.fillMode, c1: toHex(v) };
    return o.fillMode;
  }
  if (v instanceof Gradient) {
    const stops = v.colorStops;
    return { mode: v.type as 'linear' | 'radial', c1: toHex(stops[0]?.color), c2: toHex(stops[stops.length - 1]?.color), angle: 0 };
  }
  if (!v || v === 'transparent' || v === 'rgba(0,0,0,0)') return { mode: 'none', c1: '#000000', c2: '#ffffff', angle: 90 };
  return { mode: 'solid', c1: toHex(v), c2: '#ffffff', angle: 90 };
}

export function FillEditor({ value, onChange, allowNone = true, testId }: { value: FillMode; onChange: (f: FillMode) => void; allowNone?: boolean; testId?: string }) {
  return (
    <div className="fill-editor">
      <Seg
        value={value.mode}
        onChange={(m) => onChange({ ...value, mode: m })}
        options={[
          ...(allowNone ? [{ value: 'none' as const, label: 'None' }] : []),
          { value: 'solid' as const, label: 'Solid' },
          { value: 'linear' as const, label: 'Linear' },
          { value: 'radial' as const, label: 'Radial' },
        ]}
      />
      {value.mode !== 'none' && (
        <div className="fill-colors">
          <ColorInput testId={testId} value={value.c1} onChange={(c) => onChange({ ...value, c1: c, mode: value.mode })} />
          {value.mode !== 'solid' && <ColorInput value={value.c2} onChange={(c) => onChange({ ...value, c2: c })} />}
        </div>
      )}
      {value.mode === 'linear' && <Slider label="Angle" min={0} max={360} value={value.angle} onChange={(a) => onChange({ ...value, angle: a })} suffix="°" />}
      {value.mode === 'solid' && <Swatches onPick={(c) => onChange({ ...value, c1: c })} />}
    </div>
  );
}

export function PropertiesPanel() {
  useStore((s) => s.selVersion);
  const hasPx = useStore((s) => s.hasPixelSelection);
  const objs = editor.canvas ? editor.activeObjects() : [];
  const a: any = editor.canvas ? editor.active() : null;
  return (
    <div className="panel-scroll" data-testid="properties">
      {hasPx && <PixelSelectionSection />}
      {!a ? <DocumentSection /> : <ObjectSections a={a} multi={objs.length > 1} />}
    </div>
  );
}

function PixelSelectionSection() {
  const fill = useStore((s) => s.options.fill);
  const b = editor.selectionBounds();
  return (
    <Section title="Pixel selection">
      {b && <div className="muted small">{b.w} × {b.h}px at {b.x}, {b.y}</div>}
      <div className="btn-grid">
        <button className="btn primary" data-testid="sel-remove" onClick={() => editor.removeObject()}>Remove object</button>
        <button className="btn" data-testid="sel-extract" onClick={() => editor.extractSelection()}>Extract to layer</button>
        <button className="btn" onClick={() => editor.fillSelection(fill)}>Fill</button>
        <button className="btn" onClick={() => editor.effectSelection('blur')}>Blur</button>
        <button className="btn" onClick={() => editor.effectSelection('pixelate')}>Pixelate</button>
        <button className="btn" onClick={() => editor.deleteSelectionFromLayer()}>Erase from layer</button>
        <button className="btn" onClick={() => editor.invertSelection()}>Invert</button>
        <button className="btn" onClick={() => { const bb = editor.selectionBounds(); if (bb) editor.cropDocument(bb.x, bb.y, bb.w, bb.h); }}>Crop to selection</button>
        <button className="btn" onClick={() => editor.clearPixelSelection()}>Deselect</button>
      </div>
    </Section>
  );
}

function DocumentSection() {
  const doc = useStore((s) => s.doc);
  const d = useStore((s) => s.setDialog);
  return (
    <>
      <Section title="Canvas">
        <Row label="Size">
          <span className="mono">{doc.width} × {doc.height}px</span>
        </Row>
        <div className="btn-row">
          <button className="btn" onClick={() => d('resize')}>Image size</button>
          <button className="btn" onClick={() => d('canvasSize')}>Canvas size</button>
          <button className="btn" onClick={() => useStore.getState().setTool('crop')}>Crop</button>
        </div>
        <Row label="Background">
          <Toggle
            checked={doc.background === null}
            onChange={(v) => editor.setDoc({ background: v ? null : '#ffffff' })}
            label="Transparent"
          />
        </Row>
        {doc.background !== null && (
          <>
            <Row>
              <ColorInput testId="doc-bg" value={doc.background} onChange={(c) => editor.setDoc({ background: c })} />
            </Row>
            <Swatches onPick={(c) => editor.setDoc({ background: c })} />
          </>
        )}
        <Slider label="Rounded corners" min={0} max={Math.round(Math.min(doc.width, doc.height) / 2)} value={doc.cornerRadius} onChange={(v) => editor.setDoc({ cornerRadius: v })} suffix="px" />
        <div className="btn-row">
          <button className="btn" onClick={() => editor.rotateDocument(-90)} title="Rotate canvas left"><RotateCw size={14} style={{ transform: 'scaleX(-1)' }} /></button>
          <button className="btn" onClick={() => editor.rotateDocument(90)} title="Rotate canvas right"><RotateCw size={14} /></button>
          <button className="btn" onClick={() => editor.flipDocument('x')} title="Flip horizontal"><FlipHorizontal2 size={14} /></button>
          <button className="btn" onClick={() => editor.flipDocument('y')} title="Flip vertical"><FlipVertical2 size={14} /></button>
          <button className="btn" onClick={() => d('frame')}>Frame</button>
        </div>
      </Section>
      <Section title="Quick add">
        <div className="btn-grid">
          <button className="btn" onClick={() => editor.addText('Heading', undefined, { fontWeight: 'bold' })}>Heading</button>
          <button className="btn" onClick={() => editor.addText('Body text')}>Body text</button>
          <button className="btn" onClick={() => editor.addShape('rect')}>Rectangle</button>
          <button className="btn" onClick={() => editor.addShape('ellipse')}>Ellipse</button>
          <button className="btn" onClick={() => editor.addShape('star')}>Star</button>
          <button className="btn" onClick={() => editor.addShape('heart')}>Heart</button>
        </div>
      </Section>
      <div className="muted small pad">Tip: drop images anywhere, paste screenshots with Ctrl+V, select a layer to edit its properties.</div>
    </>
  );
}

function ObjectSections({ a, multi }: { a: any; multi: boolean }) {
  const isImage = a instanceof FabricImage;
  const isText = a instanceof FabricText;
  const isArrow = a instanceof Arrow;
  const isEffect = a instanceof EffectRegion;
  const isGroup = a instanceof Group && !(a instanceof ActiveSelection);
  const isCrop = a === editor.cropRect;
  if (isCrop) return <Section title="Crop"><div className="muted small">Adjust the crop box then press Enter or Apply.</div></Section>;
  const set = (p: Record<string, any>, commit: 'now' | 'debounce' = 'debounce') => editor.setProps(p, { commit });
  const b = a.getBoundingRect();
  const hasFill = !isImage && !isArrow && !isEffect && a.type !== 'path' || (a.type === 'path' && a.fill && a.fill !== '');
  const locked = !!a.locked;
  return (
    <>
      <Section
        title={multi ? `${editor.activeObjects().length} layers` : a.name || 'Layer'}
        right={
          <span className="inline-actions">
            <button className="icon-btn" title="Duplicate (Ctrl+D)" onClick={() => editor.duplicate()}><Copy size={14} /></button>
            <button className="icon-btn" title="Delete (Del)" onClick={() => editor.deleteSelected()} data-testid="delete-layer"><Trash2 size={14} /></button>
          </span>
        }
      >
        {locked && <div className="muted small">This layer is locked. Unlock it in the Layers panel to edit.</div>}
        <div className="align-row">
          <button className="icon-btn" title="Align left" onClick={() => editor.align('left')}><AlignStartVertical size={15} /></button>
          <button className="icon-btn" title="Align centre" onClick={() => editor.align('hcenter')}><AlignCenterVertical size={15} /></button>
          <button className="icon-btn" title="Align right" onClick={() => editor.align('right')}><AlignEndVertical size={15} /></button>
          <button className="icon-btn" title="Align top" onClick={() => editor.align('top')}><AlignStartHorizontal size={15} /></button>
          <button className="icon-btn" title="Align middle" onClick={() => editor.align('vcenter')}><AlignCenterHorizontal size={15} /></button>
          <button className="icon-btn" title="Align bottom" onClick={() => editor.align('bottom')}><AlignEndHorizontal size={15} /></button>
          <span className="spacer" />
          <button className="icon-btn" title="Flip horizontal" onClick={() => editor.flipSelected('x')}><FlipHorizontal2 size={15} /></button>
          <button className="icon-btn" title="Flip vertical" onClick={() => editor.flipSelected('y')}><FlipVertical2 size={15} /></button>
          <button className="icon-btn" title="Rotate 90°" onClick={() => editor.rotateSelected(90)}><RotateCw size={15} /></button>
        </div>
        {!multi && (
          <div className="xywh">
            <NumberInput label="X" value={b.left} onChange={(v) => set({ left: (a.left || 0) + (v - b.left) }, 'now')} />
            <NumberInput label="Y" value={b.top} onChange={(v) => set({ top: (a.top || 0) + (v - b.top) }, 'now')} />
            <NumberInput label="W" testId="prop-w" value={a.getScaledWidth()} min={1} onChange={(v) => set({ scaleX: v / (a.width || 1) }, 'now')} />
            <NumberInput label="H" value={a.getScaledHeight()} min={1} onChange={(v) => set({ scaleY: v / (a.height || 1) }, 'now')} />
            <NumberInput label="°" value={a.angle || 0} onChange={(v) => { a.rotate(v); a.setCoords(); editor.canvas.requestRenderAll(); editor.commit(); }} />
          </div>
        )}
        <Slider label="Opacity" testId="prop-opacity" min={0} max={100} value={Math.round((a.opacity ?? 1) * 100)} onChange={(v) => set({ opacity: v / 100 })} suffix="%" />
        <Row label="Blend">
          <select value={a.globalCompositeOperation || 'source-over'} onChange={(e) => set({ globalCompositeOperation: e.target.value }, 'now')}>
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>{m === 'source-over' ? 'normal' : m}</option>
            ))}
          </select>
        </Row>
      </Section>

      {isText && <TextSection a={a} />}

      {hasFill && !isGroup && (
        <Section title="Fill">
          <FillEditor testId="fill-color" value={fillModeOf(a)} onChange={(f) => editor.setFillMode(f)} />
        </Section>
      )}

      {isArrow && (
        <Section title="Line / arrow">
          <Row label="Colour"><ColorInput value={String(a.stroke || "#000000")} onChange={(c) => set({ stroke: c })} /></Row>
          <Swatches onPick={(c) => set({ stroke: c }, 'now')} />
          <Slider label="Width" min={1} max={60} value={a.strokeWidth} onChange={(v) => set({ strokeWidth: v })} />
          <Slider label="Head size" min={0.5} max={3} step={0.1} value={a.headScale || 1} onChange={(v) => set({ headScale: v })} />
          <div className="btn-row">
            <Toggle checked={a.headStart} onChange={(v) => set({ headStart: v }, 'now')} label="Start head" />
            <Toggle checked={a.headEnd} onChange={(v) => set({ headEnd: v }, 'now')} label="End head" />
            <Toggle checked={!!a.strokeDashArray?.length} onChange={(v) => set({ strokeDashArray: v ? [a.strokeWidth * 2, a.strokeWidth * 1.5] : null }, 'now')} label="Dashed" />
          </div>
        </Section>
      )}

      {isEffect && (
        <Section title="Effect region">
          <Seg value={a.effect} onChange={(v) => set({ effect: v, name: v === 'blur' ? 'Blur region' : 'Pixelate region' }, 'now')} options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }]} />
          <Slider label="Strength" min={1} max={80} value={a.strength} onChange={(v) => set({ strength: v })} />
          <Slider label="Corner radius" min={0} max={100} value={a.rx || 0} onChange={(v) => set({ cornerRadius: v })} />
        </Section>
      )}

      {!isArrow && !isEffect && !isGroup && (
        <Section title="Stroke" defaultOpen={!!a.strokeWidth && !isImage}>
          <Row label="Colour"><ColorInput value={typeof a.stroke === 'string' ? a.stroke : '#000000'} onChange={(c) => set({ stroke: c, strokeWidth: a.strokeWidth || 2 })} /></Row>
          <Slider label="Width" min={0} max={50} value={a.strokeWidth || 0} onChange={(v) => set({ strokeWidth: v, stroke: a.stroke || '#000000' })} />
          {!isImage && (
            <Toggle checked={!!a.strokeDashArray?.length} onChange={(v) => set({ strokeDashArray: v ? [10, 6] : null }, 'now')} label="Dashed" />
          )}
        </Section>
      )}

      {(isImage || a.type === 'rect') && !isEffect && (
        <Section title="Corners">
          <Slider label="Corner radius" min={0} max={Math.round(Math.min(a.getScaledWidth(), a.getScaledHeight()) / 2)} value={a.cornerRadius ?? a.rx ?? 0} onChange={(v) => set({ cornerRadius: v })} suffix="px" />
        </Section>
      )}

      <ShadowSection a={a} />

      {isImage && !multi && (
        <Section title="Image">
          <div className="muted small">
            Source {((a as any)._originalElement?.naturalWidth || a.width)} × {((a as any)._originalElement?.naturalHeight || a.height)}px
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => useStore.setState({ rightTab: 'adjust' })}>Adjustments…</button>
            <button className="btn" onClick={() => editor.trimToContent()}>Fit canvas to image</button>
            <button className="btn" onClick={() => { a.set({ scaleX: 1, scaleY: 1 }); a.setCoords(); editor.canvas.requestRenderAll(); editor.commit(); }}>100% size</button>
          </div>
        </Section>
      )}
      {isGroup && (a as any).layerType === 'counter' && <CounterSection a={a} />}
    </>
  );
}

function CounterSection({ a }: { a: any }) {
  const [circle, label] = a._objects || [];
  if (!circle || !label) return null;
  return (
    <Section title="Step marker">
      <Row label="Number">
        <NumberInput value={Number(label.text) || 0} onChange={(v) => { label.set({ text: String(v) }); a.name = `Step ${v}`; a.dirty = true; editor.canvas.requestRenderAll(); editor.commit(); }} />
      </Row>
      <Row label="Colour">
        <ColorInput value={circle.fill} onChange={(c) => { circle.set({ fill: c }); a.dirty = true; editor.canvas.requestRenderAll(); editor.commitDebounced(); }} />
      </Row>
    </Section>
  );
}

function ShadowSection({ a }: { a: any }) {
  const sh = a.shadow;
  const on = !!sh;
  const cur = { color: sh?.color || 'rgba(0,0,0,0.4)', blur: sh?.blur ?? 12, offsetX: sh?.offsetX ?? 4, offsetY: sh?.offsetY ?? 6 };
  const upd = (p: Partial<typeof cur>) => editor.setProps({ shadow: { ...cur, ...p } });
  return (
    <Section title="Shadow" defaultOpen={on} right={<input type="checkbox" checked={on} aria-label="Shadow" data-testid="shadow-toggle" onChange={(e) => editor.setProps({ shadow: e.target.checked ? cur : null }, { commit: 'now' })} />}>
      {on ? (
        <>
          <Row label="Colour"><ColorInput value={cur.color} onChange={(c) => upd({ color: c })} /></Row>
          <Slider label="Blur" min={0} max={100} value={cur.blur} onChange={(v) => upd({ blur: v })} />
          <Slider label="Offset X" min={-100} max={100} value={cur.offsetX} onChange={(v) => upd({ offsetX: v })} />
          <Slider label="Offset Y" min={-100} max={100} value={cur.offsetY} onChange={(v) => upd({ offsetY: v })} />
        </>
      ) : (
        <div className="muted small">Enable to add a drop shadow or glow.</div>
      )}
    </Section>
  );
}

function TextSection({ a }: { a: any }) {
  const set = (p: Record<string, any>, commit: 'now' | 'debounce' = 'debounce') => editor.setProps(p, { commit });
  const [styles, setStyles] = useState(customTextStyles.list());
  const applyStyle = (props: Record<string, any>) => {
    const { shadow, ...rest } = props;
    set({ stroke: null, strokeWidth: 0, backgroundColor: '', fontWeight: 'normal', ...rest, shadow: shadow ?? null }, 'now');
    a.fillMode = undefined;
  };
  return (
    <Section title="Text">
      <textarea
        className="text-edit"
        data-testid="text-content"
        value={a.text}
        onChange={(e) => set({ text: e.target.value, name: e.target.value.slice(0, 24) })}
        rows={2}
      />
      <Row label="Font">
        <select data-testid="font-select" value={a.fontFamily} onChange={(e) => set({ fontFamily: e.target.value }, 'now')} style={{ fontFamily: a.fontFamily }}>
          {FONT_LIST.map((f) => (
            <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.name}</option>
          ))}
        </select>
      </Row>
      <div className="xywh">
        <NumberInput label="Size" testId="font-size" value={a.fontSize} min={4} max={1000} onChange={(v) => set({ fontSize: v }, 'now')} />
        <NumberInput label="Line" value={a.lineHeight} step={0.05} min={0.5} max={4} onChange={(v) => set({ lineHeight: v }, 'now')} />
        <NumberInput label="Spacing" value={a.charSpacing} step={10} min={-200} max={2000} onChange={(v) => set({ charSpacing: v }, 'now')} />
      </div>
      <div className="btn-row">
        <button className={'icon-btn' + (a.fontWeight === 'bold' ? ' on' : '')} title="Bold" onClick={() => set({ fontWeight: a.fontWeight === 'bold' ? 'normal' : 'bold' }, 'now')}><Bold size={15} /></button>
        <button className={'icon-btn' + (a.fontStyle === 'italic' ? ' on' : '')} title="Italic" onClick={() => set({ fontStyle: a.fontStyle === 'italic' ? 'normal' : 'italic' }, 'now')}><Italic size={15} /></button>
        <button className={'icon-btn' + (a.underline ? ' on' : '')} title="Underline" onClick={() => set({ underline: !a.underline }, 'now')}><Underline size={15} /></button>
        <button className={'icon-btn' + (a.linethrough ? ' on' : '')} title="Strikethrough" onClick={() => set({ linethrough: !a.linethrough }, 'now')}><Strikethrough size={15} /></button>
        <span className="spacer" />
        <button className={'icon-btn' + (a.textAlign === 'left' ? ' on' : '')} title="Align left" onClick={() => set({ textAlign: 'left' }, 'now')}><AlignLeft size={15} /></button>
        <button className={'icon-btn' + (a.textAlign === 'center' ? ' on' : '')} title="Align centre" onClick={() => set({ textAlign: 'center' }, 'now')}><AlignCenter size={15} /></button>
        <button className={'icon-btn' + (a.textAlign === 'right' ? ' on' : '')} title="Align right" onClick={() => set({ textAlign: 'right' }, 'now')}><AlignRight size={15} /></button>
      </div>
      <Row label="Highlight">
        <Toggle checked={!!a.backgroundColor} onChange={(v) => set({ backgroundColor: v ? '#ffeb3b' : '' }, 'now')} label="Background" />
        {a.backgroundColor && <ColorInput value={a.backgroundColor} onChange={(c) => set({ backgroundColor: c })} />}
      </Row>
      <Row label="Outline">
        <Toggle checked={!!a.strokeWidth} onChange={(v) => set({ stroke: v ? '#000000' : null, strokeWidth: v ? Math.max(1, Math.round(a.fontSize / 24)) : 0, paintFirst: 'stroke' }, 'now')} label="Outline" />
      </Row>
      <div className="sub-title">Styles</div>
      <div className="style-chips">
        {TEXT_STYLES.map((s) => (
          <button key={s.name} className="chip" style={{ fontFamily: String(s.props.fontFamily) }} onClick={() => applyStyle(s.props)}>{s.name}</button>
        ))}
        {styles.map((s) => (
          <button
            key={'c' + s.name}
            className="chip custom"
            title="Right-click to delete"
            onClick={() => applyStyle(s.props)}
            onContextMenu={(e) => { e.preventDefault(); customTextStyles.remove(s.name); setStyles(customTextStyles.list()); }}
          >
            {s.name}
          </button>
        ))}
        <button
          className="chip add"
          onClick={() => {
            const name = prompt('Save current text style as:');
            if (!name) return;
            const props: Record<string, any> = {
              fontFamily: a.fontFamily, fontSize: a.fontSize, fontWeight: a.fontWeight, fontStyle: a.fontStyle,
              fill: typeof a.fill === 'string' ? a.fill : '#000000', stroke: a.stroke, strokeWidth: a.strokeWidth,
              backgroundColor: a.backgroundColor, charSpacing: a.charSpacing, lineHeight: a.lineHeight,
              shadow: a.shadow ? { color: a.shadow.color, blur: a.shadow.blur, offsetX: a.shadow.offsetX, offsetY: a.shadow.offsetY } : null,
            };
            customTextStyles.add(name, props);
            setStyles(customTextStyles.list());
          }}
        >
          + Save style
        </button>
      </div>
    </Section>
  );
}
