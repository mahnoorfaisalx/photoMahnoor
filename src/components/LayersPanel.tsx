import { useState } from 'react';
import { editor } from '../editor/editor';
import { useStore } from '../store';
import { Eye, EyeOff, Lock, Unlock, Trash2, Copy, ChevronUp, ChevronDown, Image as ImageIcon, Type, Shapes, ArrowUpRight, Droplets, PenLine, Layers, Hash, Group } from 'lucide-react';

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon size={13} />,
  patch: <ImageIcon size={13} />,
  background: <ImageIcon size={13} />,
  text: <Type size={13} />,
  shape: <Shapes size={13} />,
  annotation: <ArrowUpRight size={13} />,
  effect: <Droplets size={13} />,
  draw: <PenLine size={13} />,
  counter: <Hash size={13} />,
  group: <Group size={13} />,
};

export function LayersPanel() {
  const layers = useStore((s) => s.layers);
  const selected = useStore((s) => s.selectedIds);
  const thumbs = useStore((s) => s.thumbs);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const total = layers.length;
  return (
    <div className="layers" data-testid="layers-panel">
      <div className="panel-head">
        <Layers size={14} /> <span>Layers</span>
        <span className="spacer" />
        <button className="icon-btn" title="Move up" disabled={!selected.length} onClick={() => editor.arrange('forward')}><ChevronUp size={14} /></button>
        <button className="icon-btn" title="Move down" disabled={!selected.length} onClick={() => editor.arrange('backward')}><ChevronDown size={14} /></button>
        <button className="icon-btn" title="Duplicate" disabled={!selected.length} onClick={() => editor.duplicate()}><Copy size={14} /></button>
        <button className="icon-btn" title="Delete" disabled={!selected.length} onClick={() => editor.deleteSelected()}><Trash2 size={14} /></button>
      </div>
      <div className="layer-list">
        {layers.length === 0 && <div className="muted small pad">No layers yet. Add an image, text or shape.</div>}
        {layers.map((l, i) => (
          <div
            key={l.id}
            data-testid="layer-row"
            data-name={l.name}
            className={'layer' + (selected.includes(l.id) ? ' sel' : '') + (!l.visible ? ' hidden' : '') + (overId === l.id ? ' over' : '')}
            draggable={editing !== l.id}
            onDragStart={(e) => {
              setDragId(l.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/x-layer', l.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(l.id);
            }}
            onDragLeave={() => setOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragId && dragId !== l.id) editor.moveLayerTo(dragId, total - 1 - i);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onClick={(e) => editor.selectLayer(l.id, e.shiftKey || e.metaKey || e.ctrlKey)}
          >
            <div className="thumb">{thumbs[l.id] ? <img src={thumbs[l.id]} alt="" /> : KIND_ICON[l.kind] || <Shapes size={13} />}</div>
            <div className="lname">
              {editing === l.id ? (
                <input
                  autoFocus
                  defaultValue={l.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    editor.renameLayer(l.id, e.target.value || l.name);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <span onDoubleClick={() => setEditing(l.id)} title="Double-click to rename">
                  <span className="kind">{KIND_ICON[l.kind]}</span> {l.name}
                </span>
              )}
            </div>
            <button
              className="icon-btn tiny"
              title={l.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation();
                editor.setLayerProp(l.id, { locked: !l.locked });
              }}
            >
              {l.locked ? <Lock size={13} /> : <Unlock size={13} className="dim" />}
            </button>
            <button
              className="icon-btn tiny"
              data-testid="layer-visibility"
              title={l.visible ? 'Hide' : 'Show'}
              onClick={(e) => {
                e.stopPropagation();
                editor.setLayerProp(l.id, { visible: !l.visible });
              }}
            >
              {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
