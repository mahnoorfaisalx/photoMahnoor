import { useEffect, useRef, useState } from 'react';
import { editor } from '../editor/editor';
import { useStore } from '../store';
import { openImages, openProject, save, saveAs } from '../editor/commands';
import { removeBackgroundFromLayer, selectSubject } from '../editor/ai';
import { Undo2, Redo2, Download, Save, ImagePlus, Sparkles } from 'lucide-react';

type Item = { label: string; kbd?: string; action?: () => void; disabled?: boolean; sep?: false; testId?: string } | { sep: true };

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const st = useStore();
  const d = st.setDialog;
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  const hasSel = st.selectedIds.length > 0;
  const px = st.hasPixelSelection;
  const menus: Record<string, Item[]> = {
    File: [
      { label: 'New…', kbd: 'Ctrl+N', action: () => d('new'), testId: 'menu-new' },
      { label: 'Open image…', kbd: 'Ctrl+O', action: openImages },
      { label: 'Open project file…', kbd: 'Ctrl+Shift+O', action: openProject },
      { label: 'Projects library…', action: () => d('projects') },
      { sep: true },
      { label: 'Save to library', kbd: 'Ctrl+S', action: save, testId: 'menu-save' },
      { label: 'Download project (.pmproj)', kbd: 'Ctrl+Shift+S', action: saveAs },
      { sep: true },
      { label: 'Export image…', kbd: 'Ctrl+E', action: () => d('export') },
      { label: 'Batch process images…', kbd: 'Ctrl+Shift+B', action: () => d('batch') },
    ],
    Edit: [
      { label: 'Undo', kbd: 'Ctrl+Z', action: () => editor.undo(), disabled: !st.canUndo },
      { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: () => editor.redo(), disabled: !st.canRedo },
      { sep: true },
      { label: 'Cut', kbd: 'Ctrl+X', action: () => editor.copy(true), disabled: !hasSel },
      { label: 'Copy', kbd: 'Ctrl+C', action: () => editor.copy(), disabled: !hasSel && !px },
      { label: 'Paste', kbd: 'Ctrl+V', action: () => editor.pasteInternal() },
      { label: 'Copy as PNG', kbd: 'Ctrl+Shift+C', action: () => editor.copyAsImage() },
      { label: 'Duplicate', kbd: 'Ctrl+D', action: () => editor.duplicate(), disabled: !hasSel },
      { label: 'Delete', kbd: 'Del', action: () => editor.deleteSelected(), disabled: !hasSel },
      { sep: true },
      { label: 'Select all layers', kbd: 'Ctrl+A', action: () => editor.selectAllLayers() },
      { label: 'Deselect', kbd: 'Esc', action: () => editor.deselect() },
    ],
    Image: [
      { label: 'Image size…', action: () => d('resize') },
      { label: 'Canvas size…', action: () => d('canvasSize') },
      { label: 'Crop…', kbd: 'C', action: () => st.setTool('crop') },
      { label: 'Trim canvas to content / selection', action: () => editor.trimToContent() },
      { sep: true },
      { label: 'Rotate 90° clockwise', action: () => editor.rotateDocument(90) },
      { label: 'Rotate 90° counter-clockwise', action: () => editor.rotateDocument(-90) },
      { label: 'Rotate 180°', action: () => editor.rotateDocument(180) },
      { label: 'Flip canvas horizontal', action: () => editor.flipDocument('x') },
      { label: 'Flip canvas vertical', action: () => editor.flipDocument('y') },
      { sep: true },
      { label: 'Screenshot frame (background, padding, shadow)…', action: () => d('frame') },
    ],
    Layer: [
      { label: 'Add text', action: () => editor.addText('Your text') },
      { label: 'Add rectangle', action: () => editor.addShape('rect') },
      { label: 'Add ellipse', action: () => editor.addShape('ellipse') },
      { label: 'Add star', action: () => editor.addShape('star') },
      { label: 'Add heart', action: () => editor.addShape('heart') },
      { label: 'Add diamond', action: () => editor.addShape('diamond') },
      { sep: true },
      { label: 'Group', kbd: 'Ctrl+G', action: () => editor.groupSelected(), disabled: st.selectedIds.length < 2 },
      { label: 'Ungroup', kbd: 'Ctrl+Shift+G', action: () => editor.ungroupSelected() },
      { sep: true },
      { label: 'Bring to front', kbd: 'Ctrl+Shift+]', action: () => editor.arrange('front'), disabled: !hasSel },
      { label: 'Bring forward', kbd: 'Ctrl+]', action: () => editor.arrange('forward'), disabled: !hasSel },
      { label: 'Send backward', kbd: 'Ctrl+[', action: () => editor.arrange('backward'), disabled: !hasSel },
      { label: 'Send to back', kbd: 'Ctrl+Shift+[', action: () => editor.arrange('back'), disabled: !hasSel },
      { sep: true },
      { label: 'Flip layer horizontal', action: () => editor.flipSelected('x'), disabled: !hasSel },
      { label: 'Flip layer vertical', action: () => editor.flipSelected('y'), disabled: !hasSel },
      { label: 'Rotate layer 90°', action: () => editor.rotateSelected(90), disabled: !hasSel },
    ],
    Select: [
      { label: 'All pixels', action: () => editor.selectAllPixels() },
      { label: 'Deselect pixels', action: () => editor.clearPixelSelection(), disabled: !px },
      { label: 'Invert', kbd: 'Ctrl+Shift+I', action: () => editor.invertSelection() },
      { label: 'Subject (AI)', action: () => selectSubject('ai') },
      { sep: true },
      { label: 'Extract to new layer', action: () => editor.extractSelection(), disabled: !px },
      { label: 'Remove object (content-aware fill)', action: () => editor.removeObject(), disabled: !px },
      { label: 'Fill with fill colour', action: () => editor.fillSelection(st.options.fill), disabled: !px },
      { label: 'Blur selection', action: () => editor.effectSelection('blur'), disabled: !px },
      { label: 'Pixelate selection', action: () => editor.effectSelection('pixelate'), disabled: !px },
      { label: 'Erase from selected image layer', action: () => editor.deleteSelectionFromLayer(), disabled: !px },
    ],
    AI: [
      { label: 'Remove background (AI)', action: () => removeBackgroundFromLayer('ai'), testId: 'menu-remove-bg' },
      { label: 'Remove background (quick, offline)', action: () => removeBackgroundFromLayer('quick') },
      { label: 'Replace background…', action: () => d('bgReplace') },
      { label: 'Select subject', action: () => selectSubject('ai') },
      { label: 'Remove object (paint with brush select)', action: () => st.setTool('brushSelect') },
      { sep: true },
      { label: 'About AI features…', action: () => d('about') },
    ],
    View: [
      { label: 'Zoom in', kbd: 'Ctrl++', action: () => editor.zoomBy(1.25) },
      { label: 'Zoom out', kbd: 'Ctrl+-', action: () => editor.zoomBy(0.8) },
      { label: 'Fit to screen', kbd: 'Ctrl+0', action: () => editor.fit() },
      { label: 'Actual size (100%)', kbd: 'Ctrl+1', action: () => editor.actualSize() },
    ],
    Help: [
      { label: 'Keyboard shortcuts', kbd: '?', action: () => d('shortcuts') },
      { label: 'About PhotoMahnoor', action: () => d('about') },
    ],
  };
  return (
    <div className="menubar" ref={ref}>
      <div className="brand" title="PhotoMahnoor">
        <span className="logo">◆</span> PhotoMahnoor
      </div>
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className="menu">
          <button
            className={'menu-btn' + (open === name ? ' open' : '')}
            data-testid={`menu-${name.toLowerCase()}`}
            onMouseDown={() => setOpen(open === name ? null : name)}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <div className="menu-pop">
              {items.map((it, i) =>
                it.sep ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={i}
                    className="menu-item"
                    data-testid={it.testId}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.action?.();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.kbd && <span className="kbd">{it.kbd}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="menubar-spacer" />
      <input
        className="doc-name"
        value={st.doc.name}
        onChange={(e) => editor.setDoc({ name: e.target.value }, false)}
        title="Document name"
        aria-label="Document name"
      />
      {st.dirty && <span className="dirty" title="Unsaved changes">●</span>}
      <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!st.canUndo} onClick={() => editor.undo()} data-testid="undo">
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!st.canRedo} onClick={() => editor.redo()} data-testid="redo">
        <Redo2 size={16} />
      </button>
      <button className="btn" onClick={openImages} title="Add image (Ctrl+O)">
        <ImagePlus size={15} /> Add image
      </button>
      <button className="btn" onClick={() => removeBackgroundFromLayer('ai')} title="Remove background with AI">
        <Sparkles size={15} /> Remove BG
      </button>
      <button className="btn" onClick={save} title="Save to browser library (Ctrl+S)">
        <Save size={15} /> Save
      </button>
      <button className="btn primary" onClick={() => d('export')} data-testid="export-btn" title="Export (Ctrl+E)">
        <Download size={15} /> Export
      </button>
    </div>
  );
}
