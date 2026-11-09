import { create } from 'zustand';

export type Tool =
  | 'select'
  | 'hand'
  | 'crop'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'polygon'
  | 'bubble'
  | 'line'
  | 'arrow'
  | 'pen'
  | 'highlighter'
  | 'highlight'
  | 'blur'
  | 'pixelate'
  | 'redact'
  | 'counter'
  | 'marquee'
  | 'lasso'
  | 'wand'
  | 'brushSelect'
  | 'eyedropper';

export interface DocState {
  width: number;
  height: number;
  background: string | null; // null = transparent
  cornerRadius: number;
  name: string;
}

export interface LayerInfo {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface ToolOptions {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontFamily: string;
  fontSize: number;
  wandTolerance: number;
  wandContiguous: boolean;
  brushSize: number;
  effectStrength: number;
  highlightColor: string;
  counterNext: number;
  cropAspect: string; // 'free' | '1:1' | '16:9' ...
  selectMode: 'replace' | 'add' | 'subtract';
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export type DialogName =
  | null
  | 'new'
  | 'export'
  | 'resize'
  | 'canvasSize'
  | 'batch'
  | 'shortcuts'
  | 'bgReplace'
  | 'projects'
  | 'about'
  | 'frame';

interface State {
  tool: Tool;
  doc: DocState;
  layers: LayerInfo[];
  selectedIds: string[];
  selVersion: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  hasPixelSelection: boolean;
  options: ToolOptions;
  busy: { message: string; progress?: number } | null;
  toasts: Toast[];
  dialog: DialogName;
  started: boolean;
  dirty: boolean;
  thumbs: Record<string, string>;
  rightTab: 'design' | 'adjust' | 'ai';
  setTool: (t: Tool) => void;
  setOptions: (o: Partial<ToolOptions>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  setDialog: (d: DialogName) => void;
}

let toastId = 1;

export const useStore = create<State>((set, get) => ({
  tool: 'select',
  doc: { width: 1280, height: 720, background: '#ffffff', cornerRadius: 0, name: 'Untitled' },
  layers: [],
  selectedIds: [],
  selVersion: 0,
  zoom: 1,
  canUndo: false,
  canRedo: false,
  hasPixelSelection: false,
  options: {
    fill: '#3b82f6',
    stroke: '#ff3b30',
    strokeWidth: 6,
    fontFamily: 'Inter',
    fontSize: 64,
    wandTolerance: 24,
    wandContiguous: true,
    brushSize: 30,
    effectStrength: 14,
    highlightColor: '#ffeb3b',
    counterNext: 1,
    cropAspect: 'free',
    selectMode: 'replace',
  },
  busy: null,
  toasts: [],
  dialog: null,
  started: false,
  dirty: false,
  thumbs: {},
  rightTab: 'design',
  setTool: (t) => set({ tool: t }),
  setOptions: (o) => set({ options: { ...get().options, ...o } }),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 3200);
  },
  setDialog: (d) => set({ dialog: d }),
}));
