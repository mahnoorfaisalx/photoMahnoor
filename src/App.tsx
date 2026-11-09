import { confirmAction } from './lib/storage';
import { useEffect, useRef, useState } from 'react';
import { editor } from './editor/editor';
import { useStore } from './store';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { ToolOptions } from './components/ToolOptions';
import { PropertiesPanel } from './components/PropertiesPanel';
import { AdjustPanel } from './components/AdjustPanel';
import { AIPanel } from './components/AIPanel';
import { LayersPanel } from './components/LayersPanel';
import { Dialogs, SizePresetPicker, ProjectCard } from './components/Dialogs';
import { useShortcuts } from './components/useShortcuts';
import { openAnyFiles, openImages, openProject } from './editor/commands';
import { scheduleAutosave, listProjects, openFromLibrary, deleteFromLibrary, type ProjectMeta } from './editor/projects';
import { ZoomIn, ZoomOut, Maximize, ImagePlus, FolderOpen, FilePlus2, Layers3 } from 'lucide-react';
import { Point } from 'fabric';

function CanvasArea() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState(false);
  const started = useStore((s) => s.started);
  useEffect(() => {
    if (!wrap.current || !cv.current || editor.canvas) return;
    editor.mount(cv.current, wrap.current);
    editor.onCommit = scheduleAutosave;
  }, []);
  return (
    <div
      className={'canvas-wrap' + (drag ? ' dragging' : '')}
      ref={wrap}
      data-testid="canvas-wrap"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        const r = wrap.current!.getBoundingClientRect();
        const vpt = editor.canvas.viewportTransform;
        const at = new Point((e.clientX - r.left - vpt[4]) / vpt[0], (e.clientY - r.top - vpt[5]) / vpt[3]);
        if (files.some((f) => /\.(pmproj|json)$/i.test(f.name))) openAnyFiles(files);
        else if (useStore.getState().started) editor.addImageFiles(files.filter((f) => f.type.startsWith('image/')), at);
        else openAnyFiles(files);
      }}
    >
      <canvas ref={cv} />
      {!started && <Welcome />}
      {drag && <div className="drop-hint">Drop images or a project file</div>}
    </div>
  );
}

function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const set = (t: 'design' | 'adjust' | 'ai') => useStore.setState({ rightTab: t });
  return (
    <aside className="right">
      <div className="tabs">
        <button className={tab === 'design' ? 'on' : ''} onClick={() => set('design')} data-testid="tab-design">Design</button>
        <button className={tab === 'adjust' ? 'on' : ''} onClick={() => set('adjust')} data-testid="tab-adjust">Adjust</button>
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => set('ai')} data-testid="tab-ai">AI</button>
      </div>
      <div className="right-top">{tab === 'design' ? <PropertiesPanel /> : tab === 'adjust' ? <AdjustPanel /> : <AIPanel />}</div>
      <LayersPanel />
    </aside>
  );
}

function StatusBar() {
  const zoom = useStore((s) => s.zoom);
  const doc = useStore((s) => s.doc);
  const layers = useStore((s) => s.layers.length);
  return (
    <div className="statusbar">
      <span>{doc.width} × {doc.height}px</span>
      <span>{layers} layer{layers === 1 ? '' : 's'}</span>
      <span className="spacer" />
      <button className="icon-btn tiny" title="Zoom out" onClick={() => editor.zoomBy(0.8)}><ZoomOut size={14} /></button>
      <button className="zoom-val" title="Actual size" onClick={() => editor.actualSize()} data-testid="zoom">{Math.round(zoom * 100)}%</button>
      <button className="icon-btn tiny" title="Zoom in" onClick={() => editor.zoomBy(1.25)}><ZoomIn size={14} /></button>
      <button className="icon-btn tiny" title="Fit (Ctrl+0)" onClick={() => editor.fit()}><Maximize size={14} /></button>
    </div>
  );
}

function Welcome() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  useEffect(() => {
    listProjects().then(setProjects);
  }, []);
  return (
    <div className="welcome" data-testid="welcome">
      <div className="welcome-inner">
        <h1><span className="logo">◆</span> PhotoMahnoor</h1>
        <p className="muted">Edit photos, design graphics and annotate screenshots – right in your browser.</p>
        <div className="welcome-actions">
          <button className="big-btn" data-testid="welcome-open" onClick={openImages}><ImagePlus size={22} /><span>Open image</span><small>or drop / paste anywhere</small></button>
          <button className="big-btn" data-testid="welcome-blank" onClick={() => editor.newDocument(1920, 1080, '#ffffff', 'Untitled')}><FilePlus2 size={22} /><span>Blank canvas</span><small>1920 × 1080</small></button>
          <button className="big-btn" onClick={openProject}><FolderOpen size={22} /><span>Open project</span><small>.pmproj file</small></button>
          <button className="big-btn" onClick={() => { editor.newDocument(1280, 720, '#ffffff', 'Untitled', true); useStore.getState().setDialog('batch'); }}><Layers3 size={22} /><span>Batch process</span><small>many images at once</small></button>
        </div>
        {projects.length > 0 && (
          <>
            <h3>Recent projects</h3>
            <div className="project-grid">
              {projects.slice(0, 8).map((p) => (
                <ProjectCard key={p.id} p={p} onOpen={() => openFromLibrary(p.id)} onDelete={async () => { if (confirmAction(`Delete "${p.name}"?`)) { await deleteFromLibrary(p.id); setProjects(await listProjects()); } }} />
              ))}
            </div>
          </>
        )}
        <h3>Start with a size</h3>
        <SizePresetPicker onPick={(p) => editor.newDocument(p.w, p.h, '#ffffff', p.name)} />
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>
      ))}
    </div>
  );
}

function Busy() {
  const busy = useStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy" data-testid="busy">
      <div className="busy-card">
        <div className="spinner" />
        <div>{busy.message}</div>
        {busy.progress !== undefined && <progress value={busy.progress} max={100} />}
      </div>
    </div>
  );
}

export default function App() {
  useShortcuts();
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty && editor.objects().length) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);
  return (
    <div className="app">
      <MenuBar />
      <ToolOptions />
      <div className="main">
        <Toolbar />
        <div className="center">
          <CanvasArea />
        </div>
        <RightPanel />
      </div>
      <StatusBar />
      <Dialogs />
      <Toasts />
      <Busy />
    </div>
  );
}
