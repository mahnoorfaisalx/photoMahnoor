import { useEffect } from 'react';
import { editor } from '../editor/editor';
import { useStore, type Tool } from '../store';
import { isTyping, openImages, openProject, save, saveAs } from '../editor/commands';

export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  c: 'crop',
  t: 'text',
  r: 'rect',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
  p: 'pen',
  i: 'highlighter',
  g: 'highlight',
  b: 'blur',
  x: 'pixelate',
  k: 'redact',
  n: 'counter',
  m: 'marquee',
  q: 'lasso',
  w: 'wand',
  s: 'brushSelect',
  e: 'eyedropper',
};

export function useShortcuts() {
  useEffect(() => {
    const down = async (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (isTyping(e)) {
        if (e.key === 'Escape') {
          const a = editor.canvas.getActiveObject() as any;
          if (a?.isEditing) a.exitEditing();
          editor.canvas.requestRenderAll();
        }
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        editor.setSpace(true);
        return;
      }
      if (mod) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); editor.redo(); return; }
        if (k === 'c' && e.shiftKey) { e.preventDefault(); editor.copyAsImage(); return; }
        if (k === 'c') { if (editor.activeObjects().length || editor.selMask) { e.preventDefault(); editor.copy(); } return; }
        if (k === 'x') { e.preventDefault(); editor.copy(true); return; }
        if (k === 'd') { e.preventDefault(); if (editor.selMask && !editor.activeObjects().length) editor.clearPixelSelection(); else editor.duplicate(); return; }
        if (k === 'a') { e.preventDefault(); if (st.tool === 'marquee' || st.tool === 'wand' || st.tool === 'lasso' || st.tool === 'brushSelect') editor.selectAllPixels(); else editor.selectAllLayers(); return; }
        if (k === 's' && e.shiftKey) { e.preventDefault(); saveAs(); return; }
        if (k === 's') { e.preventDefault(); save(); return; }
        if (k === 'o' && e.shiftKey) { e.preventDefault(); openProject(); return; }
        if (k === 'o') { e.preventDefault(); openImages(); return; }
        if (k === 'e') { e.preventDefault(); st.setDialog('export'); return; }
        if (k === 'n') { e.preventDefault(); st.setDialog('new'); return; }
        if (k === 'g' && e.shiftKey) { e.preventDefault(); editor.ungroupSelected(); return; }
        if (k === 'g') { e.preventDefault(); editor.groupSelected(); return; }
        if (k === 'i' && e.shiftKey) { e.preventDefault(); editor.invertSelection(); return; }
        if (k === '0') { e.preventDefault(); editor.fit(); return; }
        if (k === '1') { e.preventDefault(); editor.actualSize(); return; }
        if (k === '=' || k === '+') { e.preventDefault(); editor.zoomBy(1.25); return; }
        if (k === '-') { e.preventDefault(); editor.zoomBy(0.8); return; }
        if (k === ']') { e.preventDefault(); editor.arrange(e.shiftKey ? 'front' : 'forward'); return; }
        if (k === '[') { e.preventDefault(); editor.arrange(e.shiftKey ? 'back' : 'backward'); return; }
        if (k === 'b' && e.shiftKey) { e.preventDefault(); st.setDialog('batch'); return; }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (editor.activeObjects().length) editor.deleteSelected();
        else if (editor.selMask) editor.removeObject();
        return;
      }
      if (e.key === 'Escape') {
        if (st.tool === 'crop') { editor.cancelCrop(); st.setTool('select'); return; }
        editor.deselect();
        if (st.tool !== 'select') st.setTool('select');
        return;
      }
      if (e.key === 'Enter' && st.tool === 'crop') { editor.applyCrop(); return; }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
        const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
        editor.nudge(dx, dy);
        return;
      }
      if (e.key === '?') { st.setDialog('shortcuts'); return; }
      if (e.key === '[' || e.key === ']') {
        const o = st.options;
        if (st.tool === 'brushSelect') st.setOptions({ brushSize: Math.max(2, o.brushSize + (e.key === ']' ? 5 : -5)) });
        else st.setOptions({ strokeWidth: Math.max(1, o.strokeWidth + (e.key === ']' ? 1 : -1)) });
        editor.refreshBrush();
        return;
      }
      if (e.key === '+' || e.key === '=') { editor.zoomBy(1.25); return; }
      if (e.key === '-') { editor.zoomBy(0.8); return; }
      if (e.altKey) return;
      const tool = TOOL_KEYS[k];
      if (tool && !e.shiftKey) st.setTool(tool);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') editor.setSpace(false);
    };
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e as any)) return;
      if (useStore.getState().dialog) return;
      if (!useStore.getState().started) editor.newDocument(1280, 720, '#ffffff', 'Untitled', true);
      editor.handlePaste(e);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('paste', paste);
    };
  }, []);
}
