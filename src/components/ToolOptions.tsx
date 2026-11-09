import { useStore } from '../store';
import { editor } from '../editor/editor';
import { ColorInput, NumberInput, Seg, Toggle } from './ui';
import { FONT_LIST } from '../editor/shapes';
import { selectSubject } from '../editor/ai';
import { Check, X } from 'lucide-react';

const TOOL_NAMES: Record<string, string> = {
  select: 'Select', hand: 'Hand', crop: 'Crop', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle',
  star: 'Star', polygon: 'Hexagon', bubble: 'Speech bubble', line: 'Line', arrow: 'Arrow', pen: 'Pen', highlighter: 'Highlighter',
  highlight: 'Highlight box', blur: 'Blur region', pixelate: 'Pixelate region', redact: 'Redact', counter: 'Step number',
  marquee: 'Rectangle select', lasso: 'Lasso', wand: 'Magic wand', brushSelect: 'Brush select', eyedropper: 'Eyedropper',
};

export function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const o = useStore((s) => s.options);
  const set = useStore((s) => s.setOptions);
  const hasSel = useStore((s) => s.hasPixelSelection);
  const upd = (p: Partial<typeof o>) => {
    set(p);
    setTimeout(() => editor.refreshBrush(), 0);
  };
  const selMode = (
    <Seg
      value={o.selectMode}
      onChange={(v) => set({ selectMode: v })}
      options={[
        { value: 'replace', label: 'New', title: 'New selection' },
        { value: 'add', label: 'Add', title: 'Add (Shift)' },
        { value: 'subtract', label: 'Subtract', title: 'Subtract (Alt)' },
      ]}
    />
  );
  let body: React.ReactNode = <span className="hint">Click a layer to select it. Drag to multi-select. Space+drag to pan, Ctrl+wheel to zoom.</span>;
  switch (tool) {
    case 'hand':
      body = <span className="hint">Drag to pan. Ctrl/⌘ + wheel zooms.</span>;
      break;
    case 'crop':
      body = (
        <>
          <span className="lbl">Aspect</span>
          <Seg
            value={o.cropAspect}
            onChange={(v) => {
              set({ cropAspect: v });
              editor.setCropAspect(v);
            }}
            options={['free', '1:1', '4:3', '3:2', '16:9', '9:16', '4:5'].map((v) => ({ value: v, label: v === 'free' ? 'Free' : v }))}
          />
          <button className="btn primary" data-testid="crop-apply" onClick={() => editor.applyCrop()}>
            <Check size={14} /> Apply (Enter)
          </button>
          <button className="btn" onClick={() => { editor.cancelCrop(); useStore.getState().setTool('select'); }}>
            <X size={14} /> Cancel
          </button>
        </>
      );
      break;
    case 'text':
      body = (
        <>
          <span className="lbl">Font</span>
          <select value={o.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONT_LIST.map((f) => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
          <span className="hint">Click on the canvas to place text.</span>
        </>
      );
      break;
    case 'pen':
    case 'line':
    case 'arrow':
    case 'counter':
      body = (
        <>
          <span className="lbl">Colour</span>
          <ColorInput value={o.stroke} onChange={(v) => upd({ stroke: v })} />
          {tool !== 'counter' && (
            <>
              <span className="lbl">Width</span>
              <NumberInput value={o.strokeWidth} min={1} max={200} onChange={(v) => upd({ strokeWidth: v })} width={60} />
            </>
          )}
          {tool === 'counter' && (
            <>
              <span className="lbl">Next number</span>
              <NumberInput value={o.counterNext} min={0} onChange={(v) => set({ counterNext: v })} width={60} />
            </>
          )}
          <span className="hint">{tool === 'arrow' || tool === 'line' ? 'Drag to draw. Shift snaps to 45°.' : tool === 'counter' ? 'Click to place numbered markers.' : 'Draw freehand.'}</span>
        </>
      );
      break;
    case 'highlighter':
    case 'highlight':
      body = (
        <>
          <span className="lbl">Colour</span>
          <ColorInput value={o.highlightColor} onChange={(v) => upd({ highlightColor: v })} />
          {tool === 'highlighter' && (
            <>
              <span className="lbl">Width</span>
              <NumberInput value={o.strokeWidth} min={1} max={100} onChange={(v) => upd({ strokeWidth: v })} width={60} />
            </>
          )}
          <span className="hint">Translucent marker that multiplies with what's beneath.</span>
        </>
      );
      break;
    case 'blur':
    case 'pixelate':
      body = (
        <>
          <span className="lbl">Strength</span>
          <NumberInput value={o.effectStrength} min={2} max={100} onChange={(v) => set({ effectStrength: v })} width={60} />
          <span className="hint">Drag over sensitive content. The effect stays live and editable.</span>
        </>
      );
      break;
    case 'redact':
      body = <span className="hint">Drag to cover content with a solid box. Exported images contain only the box (no recoverable data).</span>;
      break;
    case 'rect':
    case 'ellipse':
    case 'triangle':
    case 'star':
    case 'polygon':
    case 'bubble':
      body = (
        <>
          <span className="lbl">Fill</span>
          <ColorInput value={o.fill} onChange={(v) => set({ fill: v })} />
          <span className="hint">Drag to draw, Shift for equal proportions.</span>
        </>
      );
      break;
    case 'marquee':
    case 'lasso':
      body = (
        <>
          {selMode}
          <span className="hint">{tool === 'lasso' ? 'Draw around an area.' : 'Drag a rectangle.'} Shift adds, Alt subtracts.</span>
        </>
      );
      break;
    case 'wand':
      body = (
        <>
          {selMode}
          <span className="lbl">Tolerance</span>
          <NumberInput value={o.wandTolerance} min={0} max={100} onChange={(v) => set({ wandTolerance: v })} width={60} />
          <Toggle checked={o.wandContiguous} onChange={(v) => set({ wandContiguous: v })} label="Contiguous" />
          <button className="btn" onClick={() => selectSubject('ai')}>Select subject (AI)</button>
        </>
      );
      break;
    case 'brushSelect':
      body = (
        <>
          <span className="lbl">Brush</span>
          <NumberInput value={o.brushSize} min={2} max={500} onChange={(v) => set({ brushSize: v })} width={60} />
          <span className="hint">Paint over an object (Alt erases), then:</span>
          <button className="btn primary" disabled={!hasSel} onClick={() => editor.removeObject()}>Remove object</button>
        </>
      );
      break;
    case 'eyedropper':
      body = <span className="hint">Click to pick fill colour, Alt+click to pick stroke colour.</span>;
      break;
  }
  return (
    <div className="tool-options" data-testid="tool-options">
      <span className="tool-name">{TOOL_NAMES[tool]}</span>
      {body}
    </div>
  );
}
