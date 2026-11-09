import {
  MousePointer2, Hand, Crop, Type, Square, Circle, Triangle, Star, Hexagon, MessageSquare, Minus, ArrowUpRight,
  PenLine, Highlighter, Droplets, Grid3x3, EyeOff, Hash, SquareDashed, Lasso, WandSparkles, Brush, Pipette, Paintbrush,
} from 'lucide-react';
import { useStore, type Tool } from '../store';
import type { ReactNode } from 'react';

const GROUPS: { tool: Tool; icon: ReactNode; label: string; key?: string }[][] = [
  [
    { tool: 'select', icon: <MousePointer2 size={18} />, label: 'Select / Move', key: 'V' },
    { tool: 'hand', icon: <Hand size={18} />, label: 'Hand (pan) – or hold Space', key: 'H' },
    { tool: 'crop', icon: <Crop size={18} />, label: 'Crop canvas', key: 'C' },
  ],
  [
    { tool: 'text', icon: <Type size={18} />, label: 'Text', key: 'T' },
    { tool: 'rect', icon: <Square size={18} />, label: 'Rectangle', key: 'R' },
    { tool: 'ellipse', icon: <Circle size={18} />, label: 'Ellipse', key: 'O' },
    { tool: 'triangle', icon: <Triangle size={18} />, label: 'Triangle' },
    { tool: 'star', icon: <Star size={18} />, label: 'Star' },
    { tool: 'polygon', icon: <Hexagon size={18} />, label: 'Hexagon' },
    { tool: 'bubble', icon: <MessageSquare size={18} />, label: 'Speech bubble' },
    { tool: 'line', icon: <Minus size={18} />, label: 'Line', key: 'L' },
    { tool: 'pen', icon: <PenLine size={18} />, label: 'Pen (freehand)', key: 'P' },
  ],
  [
    { tool: 'arrow', icon: <ArrowUpRight size={18} />, label: 'Arrow', key: 'A' },
    { tool: 'highlight', icon: <Paintbrush size={18} />, label: 'Highlight box', key: 'G' },
    { tool: 'highlighter', icon: <Highlighter size={18} />, label: 'Highlighter (freehand)', key: 'I' },
    { tool: 'blur', icon: <Droplets size={18} />, label: 'Blur region', key: 'B' },
    { tool: 'pixelate', icon: <Grid3x3 size={18} />, label: 'Pixelate region', key: 'X' },
    { tool: 'redact', icon: <EyeOff size={18} />, label: 'Redact (solid box)', key: 'K' },
    { tool: 'counter', icon: <Hash size={18} />, label: 'Step number', key: 'N' },
  ],
  [
    { tool: 'marquee', icon: <SquareDashed size={18} />, label: 'Rectangle select', key: 'M' },
    { tool: 'lasso', icon: <Lasso size={18} />, label: 'Lasso select', key: 'Q' },
    { tool: 'wand', icon: <WandSparkles size={18} />, label: 'Magic wand (smart colour select)', key: 'W' },
    { tool: 'brushSelect', icon: <Brush size={18} />, label: 'Brush select / object-removal mask', key: 'S' },
    { tool: 'eyedropper', icon: <Pipette size={18} />, label: 'Eyedropper', key: 'E' },
  ],
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      {GROUPS.map((g, i) => (
        <div className="tool-group" key={i}>
          {g.map((t) => (
            <button
              key={t.tool}
              data-testid={`tool-${t.tool}`}
              className={'tool-btn' + (tool === t.tool ? ' active' : '')}
              onClick={() => setTool(t.tool)}
              title={t.label + (t.key ? ` (${t.key})` : '')}
              aria-label={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
      ))}
      <div className="tool-colors" title="Fill / stroke colours for new objects">
        <label className="cbox fill" style={{ background: options.fill }} title="Fill colour">
          <input type="color" value={options.fill} onChange={(e) => setOptions({ fill: e.target.value })} />
        </label>
        <label className="cbox stroke" style={{ borderColor: options.stroke }} title="Stroke / annotation colour">
          <input type="color" value={options.stroke} onChange={(e) => setOptions({ stroke: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
