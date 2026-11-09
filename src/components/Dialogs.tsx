import { getItem, setItem, confirmAction } from '../lib/storage';
import { useEffect, useMemo, useState } from 'react';
import { editor } from '../editor/editor';
import { useStore } from '../store';
import { ColorInput, Modal, NumberInput, Row, Seg, Slider, Toggle } from './ui';
import { SIZE_PRESETS, customSizes, batchRecipes, type SizePreset } from '../editor/presets';
import { downloadBlob, safeName, listProjects, openFromLibrary, deleteFromLibrary, type ProjectMeta } from '../editor/projects';
import { runBatch, DEFAULT_RECIPE, type BatchRecipe, processOne } from '../editor/batch';
import { ADJUST_PRESETS } from '../editor/adjustments';
import { customLooks } from '../editor/presets';
import { replaceBackground, type BgReplacement } from '../editor/ai';
import { pickFiles } from '../editor/commands';
import { TOOL_KEYS } from './useShortcuts';
import { Link2, Link2Off, Trash2 } from 'lucide-react';

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const close = () => useStore.getState().setDialog(null);
  switch (dialog) {
    case 'new': return <NewDialog onClose={close} />;
    case 'export': return <ExportDialog onClose={close} />;
    case 'resize': return <ResizeDialog onClose={close} />;
    case 'canvasSize': return <CanvasSizeDialog onClose={close} />;
    case 'batch': return <BatchDialog onClose={close} />;
    case 'shortcuts': return <ShortcutsDialog onClose={close} />;
    case 'bgReplace': return <BgReplaceDialog onClose={close} />;
    case 'projects': return <ProjectsDialog onClose={close} />;
    case 'about': return <AboutDialog onClose={close} />;
    case 'frame': return <FrameDialog onClose={close} />;
    default: return null;
  }
}

export function SizePresetPicker({ onPick }: { onPick: (p: SizePreset) => void }) {
  const [custom, setCustom] = useState(customSizes.list());
  const all = [...custom, ...SIZE_PRESETS];
  const groups = Array.from(new Set(all.map((p) => p.group)));
  return (
    <div className="preset-groups">
      {groups.map((g) => (
        <div key={g}>
          <div className="sub-title">{g}</div>
          <div className="preset-grid">
            {all.filter((p) => p.group === g).map((p) => (
              <button key={g + p.name} className="preset" onClick={() => onPick(p)} data-testid={`preset-${p.name}`}>
                <span className="pv" style={{ aspectRatio: `${p.w}/${p.h}` }} />
                <span className="pn">{p.name}</span>
                <span className="ps">{p.w}×{p.h}</span>
                {p.custom && (
                  <span
                    className="pdel"
                    title="Delete preset"
                    onClick={(e) => {
                      e.stopPropagation();
                      customSizes.remove(p.name);
                      setCustom(customSizes.list());
                    }}
                  >
                    <Trash2 size={11} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewDialog({ onClose }: { onClose: () => void }) {
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [bg, setBg] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const [name, setName] = useState('Untitled');
  const create = (W = w, H = h, n = name) => {
    if (useStore.getState().dirty && editor.objects().length && !confirmAction('Discard unsaved changes in the current document?')) return;
    editor.newDocument(W, H, transparent ? null : bg, n);
    onClose();
  };
  return (
    <Modal
      title="New document"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              const n = prompt('Preset name:', `${w}×${h}`);
              if (n) {
                customSizes.add({ name: n, w, h, group: 'My presets' });
                onClose();
                useStore.getState().setDialog('new');
              }
            }}
          >
            Save size as preset
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" data-testid="new-create" onClick={() => create()}>Create</button>
        </>
      }
    >
      <div className="new-grid">
        <div className="new-custom">
          <Row label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Row>
          <Row label="Width"><NumberInput testId="new-w" value={w} min={1} max={16000} onChange={setW} /> px</Row>
          <Row label="Height"><NumberInput testId="new-h" value={h} min={1} max={16000} onChange={setH} /> px</Row>
          <Row label="Background">
            <Toggle checked={transparent} onChange={setTransparent} label="Transparent" />
          </Row>
          {!transparent && <Row><ColorInput value={bg} onChange={setBg} /></Row>}
        </div>
        <div className="new-presets">
          <SizePresetPicker onPick={(p) => { setW(p.w); setH(p.h); setName(p.name); create(p.w, p.h, p.name); }} />
        </div>
      </div>
    </Modal>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1);
  const [name, setName] = useState(safeName(doc.name));
  const [size, setSize] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const blob = await editor.exportBlob(format, quality / 100, Math.min(scale, 4096 / Math.max(doc.width, doc.height) || 1));
        if (cancelled) return;
        setSize(blob.size * (scale > 4096 / Math.max(doc.width, doc.height) ? 1 : 1));
        setPreview((p) => {
          if (p) URL.revokeObjectURL(p);
          return URL.createObjectURL(blob);
        });
      } catch {
        /* ignore */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [format, quality, scale, doc.width, doc.height]);
  const doExport = async () => {
    setBusy(true);
    try {
      const blob = await editor.exportBlob(format, quality / 100, scale);
      downloadBlob(blob, `${name || 'image'}.${format === 'jpeg' ? 'jpg' : format}`);
      useStore.getState().toast(`Exported ${format.toUpperCase()} (${fmtBytes(blob.size)})`, 'success');
      onClose();
    } catch (e) {
      useStore.getState().toast('Export failed: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Export image"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={() => editor.copyAsImage()}>Copy PNG to clipboard</button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" data-testid="export-download" disabled={busy} onClick={doExport}>{busy ? 'Exporting…' : 'Download'}</button>
        </>
      }
    >
      <div className="export-grid">
        <div className="export-preview checker">{preview && <img src={preview} alt="Export preview" />}</div>
        <div>
          <Row label="File name"><input value={name} onChange={(e) => setName(e.target.value)} /></Row>
          <Row label="Format">
            <Seg value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' }]} />
          </Row>
          {format !== 'png' && <Slider label="Quality" min={10} max={100} value={quality} onChange={setQuality} suffix="%" />}
          <Row label="Scale">
            <Seg value={scale} onChange={setScale} options={[0.25, 0.5, 1, 2, 3].map((s) => ({ value: s, label: `${s}×` }))} />
          </Row>
          <div className="muted small">
            Output: {Math.round(doc.width * scale)} × {Math.round(doc.height * scale)}px
            {size !== null && scale <= 1 && <> · ≈ {fmtBytes(size)}</>}
          </div>
          {format === 'jpeg' && doc.background === null && <div className="muted small">JPG has no transparency – transparent areas become white.</div>}
        </div>
      </div>
    </Modal>
  );
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ResizeDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [lock, setLock] = useState(true);
  const ratio = doc.width / doc.height;
  return (
    <Modal
      title="Image size (scales content)"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" data-testid="resize-apply" onClick={() => { editor.resizeDocument(w, h); onClose(); }}>Resize</button>
        </>
      }
    >
      <Row label="Width"><NumberInput testId="resize-w" value={w} min={1} max={16000} onChange={(v) => { setW(v); if (lock) setH(Math.round(v / ratio)); }} /> px</Row>
      <Row label="Height"><NumberInput value={h} min={1} max={16000} onChange={(v) => { setH(v); if (lock) setW(Math.round(v * ratio)); }} /> px</Row>
      <Row label="">
        <button className="btn" onClick={() => setLock(!lock)}>{lock ? <Link2 size={14} /> : <Link2Off size={14} />} {lock ? 'Proportions locked' : 'Free'}</button>
      </Row>
      <div className="btn-row">
        {[25, 50, 75, 150, 200].map((p) => (
          <button key={p} className="btn" onClick={() => { setW(Math.round((doc.width * p) / 100)); setH(Math.round((doc.height * p) / 100)); }}>{p}%</button>
        ))}
      </div>
    </Modal>
  );
}

function CanvasSizeDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [anchor, setAnchor] = useState([0.5, 0.5]);
  return (
    <Modal
      title="Canvas size (keeps content scale)"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { editor.resizeCanvas(w, h, anchor[0], anchor[1]); onClose(); }}>Apply</button>
        </>
      }
    >
      <Row label="Width"><NumberInput value={w} min={1} max={16000} onChange={setW} /> px</Row>
      <Row label="Height"><NumberInput value={h} min={1} max={16000} onChange={setH} /> px</Row>
      <Row label="Anchor">
        <div className="anchor-grid">
          {[0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => (
            <button key={`${x}${y}`} className={anchor[0] === x && anchor[1] === y ? 'on' : ''} onClick={() => setAnchor([x, y])} />
          )))}
        </div>
      </Row>
      <div className="sub-title">Presets</div>
      <div className="preset-scroll">
        <SizePresetPicker onPick={(p) => { setW(p.w); setH(p.h); }} />
      </div>
    </Modal>
  );
}

function BatchDialog({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [r, setR] = useState<BatchRecipe>(() => {
    try {
      return { ...DEFAULT_RECIPE, ...JSON.parse(getItem('pm.lastBatch') || '{}') };
    } catch {
      return DEFAULT_RECIPE;
    }
  });
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [result, setResult] = useState<{ zip: Blob; errors: string[]; outputs: { name: string; blob: Blob }[] } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [recipes, setRecipes] = useState(batchRecipes.list());
  const looks = useMemo(() => [...ADJUST_PRESETS, ...customLooks.list()], []);
  const u = (p: Partial<BatchRecipe>) => setR((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (!files.length) return setPreview(null);
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const out = await processOne(files[0], { ...r, removeBg: r.removeBg === 'ai' ? 'none' : r.removeBg });
        if (!cancel) setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(out); });
      } catch { /* ignore */ }
    }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [files, r]);
  const run = async () => {
    setItem('pm.lastBatch', JSON.stringify(r));
    setResult(null);
    const res = await runBatch(files, r, (done, total, current) => setProgress({ done, total, current }));
    setProgress(null);
    setResult(res);
    if (res.errors.length) useStore.getState().toast(`${res.errors.length} file(s) failed`, 'error');
  };
  return (
    <Modal
      title="Batch process images"
      onClose={onClose}
      wide
      footer={
        <>
          <select
            value=""
            onChange={(e) => { const rec = recipes.find((x) => x.name === e.target.value); if (rec) setR({ ...DEFAULT_RECIPE, ...(rec.recipe as any) }); }}
          >
            <option value="">Load recipe…</option>
            {recipes.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
          <button className="btn" onClick={() => { const n = prompt('Recipe name:'); if (n) { batchRecipes.add({ name: n, recipe: r as any }); setRecipes(batchRecipes.list()); } }}>Save recipe</button>
          <span className="spacer" />
          {result && <button className="btn primary" data-testid="batch-download" onClick={() => downloadBlob(result.zip, 'batch-output.zip')}>Download ZIP ({result.outputs.length})</button>}
          <button className="btn primary" data-testid="batch-run" disabled={!files.length || !!progress} onClick={run}>
            {progress ? `Processing ${progress.done + 1}/${progress.total}…` : `Process ${files.length} image${files.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="batch-grid">
        <div>
          <div
            className="drop-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setFiles([...files, ...Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))]); }}
            onClick={async () => setFiles([...files, ...(await pickFiles('image/*', true))])}
          >
            {files.length ? `${files.length} image(s) selected – click or drop to add more` : 'Click or drop images here'}
          </div>
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-row"><span>{f.name}</span><button className="icon-btn tiny" onClick={() => setFiles(files.filter((_, j) => j !== i))}><Trash2 size={12} /></button></div>
              ))}
            </div>
          )}
          <div className="sub-title">Preview (first image)</div>
          <div className="export-preview checker small">{preview ? <img src={preview} alt="preview" /> : <span className="muted small">No preview</span>}</div>
          {progress && <progress value={progress.done} max={progress.total} />}
          {result && (
            <div className="muted small">
              Done: {result.outputs.length} processed. {result.errors.map((e) => <div key={e} className="err">{e}</div>)}
            </div>
          )}
        </div>
        <div className="batch-opts">
          <div className="sub-title">Resize</div>
          <Seg value={r.resizeMode} onChange={(v) => u({ resizeMode: v })} options={[{ value: 'none', label: 'None' }, { value: 'fit', label: 'Fit within' }, { value: 'cover', label: 'Crop to fill' }, { value: 'exact', label: 'Exact' }, { value: 'percent', label: '%' }]} />
          {(r.resizeMode === 'fit' || r.resizeMode === 'exact' || r.resizeMode === 'cover') && (
            <div className="xywh"><NumberInput label="W" value={r.width} min={1} onChange={(v) => u({ width: v })} /><NumberInput label="H" value={r.height} min={1} onChange={(v) => u({ height: v })} /></div>
          )}
          {r.resizeMode === 'percent' && <Slider label="Scale" min={5} max={200} value={r.percent} onChange={(v) => u({ percent: v })} suffix="%" />}
          <div className="sub-title">Transform</div>
          <div className="btn-row">
            <Seg value={r.rotate} onChange={(v) => u({ rotate: v })} options={[0, 90, 180, 270].map((v) => ({ value: v as 0, label: `${v}°` }))} />
            <Toggle checked={r.flipH} onChange={(v) => u({ flipH: v })} label="Flip H" />
            <Toggle checked={r.flipV} onChange={(v) => u({ flipV: v })} label="Flip V" />
          </div>
          <div className="sub-title">Look / adjustments</div>
          <select onChange={(e) => { const l = looks.find((x) => x.name === e.target.value); u({ adjust: l?.adjust || {} }); }}>
            {looks.map((l) => <option key={l.name}>{l.name}</option>)}
          </select>
          <div className="sub-title">Background</div>
          <Seg value={r.removeBg} onChange={(v) => u({ removeBg: v })} options={[{ value: 'none', label: 'Keep' }, { value: 'ai', label: 'Remove (AI)' }, { value: 'quick', label: 'Remove (quick)' }]} />
          <Row label="Fill">
            <Toggle checked={!!r.bgColor} onChange={(v) => u({ bgColor: v ? '#ffffff' : null })} label="Background colour" />
            {r.bgColor && <ColorInput value={r.bgColor} onChange={(c) => u({ bgColor: c })} />}
          </Row>
          <div className="sub-title">Style</div>
          <Slider label="Rounded corners" min={0} max={200} value={r.cornerRadius} onChange={(v) => u({ cornerRadius: v })} suffix="px" />
          <Slider label="Padding" min={0} max={400} value={r.padding} onChange={(v) => u({ padding: v })} suffix="px" />
          {r.padding > 0 && <Row label="Pad colour"><ColorInput value={r.padColor} onChange={(c) => u({ padColor: c })} /></Row>}
          <div className="sub-title">Watermark</div>
          <input placeholder="Watermark text (optional)" value={r.watermark} onChange={(e) => u({ watermark: e.target.value })} />
          {r.watermark && (
            <>
              <Seg value={r.watermarkPos} onChange={(v) => u({ watermarkPos: v })} options={[{ value: 'tl', label: '↖' }, { value: 'tr', label: '↗' }, { value: 'c', label: '•' }, { value: 'bl', label: '↙' }, { value: 'br', label: '↘' }]} />
              <Slider label="Size" min={1} max={20} value={r.watermarkSize} onChange={(v) => u({ watermarkSize: v })} suffix="%" />
              <Slider label="Opacity" min={5} max={100} value={Math.round(r.watermarkOpacity * 100)} onChange={(v) => u({ watermarkOpacity: v / 100 })} suffix="%" />
              <Row label="Colour"><ColorInput value={r.watermarkColor} onChange={(c) => u({ watermarkColor: c })} /></Row>
            </>
          )}
          <div className="sub-title">Output</div>
          <Seg value={r.format} onChange={(v) => u({ format: v })} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' }]} />
          {r.format !== 'png' && <Slider label="Quality" min={10} max={100} value={Math.round(r.quality * 100)} onChange={(v) => u({ quality: v / 100 })} suffix="%" />}
          <Row label="Name"><input value={r.naming} onChange={(e) => u({ naming: e.target.value })} title="{name} = original name, {n} = number" /></Row>
        </div>
      </div>
    </Modal>
  );
}

function BgReplaceDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<BgReplacement['kind']>('gradient');
  const [color, setColor] = useState('#ffffff');
  const [c1, setC1] = useState('#6366f1');
  const [c2, setC2] = useState('#ec4899');
  const [angle, setAngle] = useState(135);
  const [blur, setBlur] = useState(40);
  const [file, setFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<'ai' | 'quick'>('ai');
  const apply = async () => {
    let rep: BgReplacement;
    if (kind === 'color') rep = { kind, color };
    else if (kind === 'gradient') rep = { kind, c1, c2, angle };
    else if (kind === 'image') {
      if (!file) return useStore.getState().toast('Choose an image', 'error');
      rep = { kind, file };
    } else if (kind === 'blur') rep = { kind, amount: blur };
    else rep = { kind: 'transparent' };
    onClose();
    await replaceBackground(rep, engine);
  };
  return (
    <Modal title="Replace background" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" data-testid="bg-apply" onClick={apply}>Apply</button></>}>
      <p className="muted small">Removes the background of the selected image (unless it is already a cutout) and puts a new background behind it.</p>
      <Row label="Removal"><Seg value={engine} onChange={setEngine} options={[{ value: 'ai', label: 'AI' }, { value: 'quick', label: 'Quick' }]} /></Row>
      <Row label="New">
        <Seg value={kind} onChange={setKind} options={[{ value: 'color', label: 'Colour' }, { value: 'gradient', label: 'Gradient' }, { value: 'image', label: 'Image' }, { value: 'blur', label: 'Blur original' }, { value: 'transparent', label: 'None' }]} />
      </Row>
      {kind === 'color' && <Row label="Colour"><ColorInput value={color} onChange={setColor} /></Row>}
      {kind === 'gradient' && (
        <>
          <Row label="Colours"><ColorInput value={c1} onChange={setC1} /><ColorInput value={c2} onChange={setC2} /></Row>
          <Slider label="Angle" min={0} max={360} value={angle} onChange={setAngle} suffix="°" />
          <div className="grad-preview" style={{ background: `linear-gradient(${angle + 90}deg, ${c1}, ${c2})` }} />
        </>
      )}
      {kind === 'image' && (
        <Row label="Image"><button className="btn" onClick={async () => setFile((await pickFiles('image/*'))[0] || null)}>{file ? file.name : 'Choose image…'}</button></Row>
      )}
      {kind === 'blur' && <Slider label="Blur" min={5} max={100} value={blur} onChange={setBlur} />}
    </Modal>
  );
}

function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ProjectMeta[] | null>(null);
  useEffect(() => { listProjects().then(setItems); }, []);
  return (
    <Modal title="Projects library (saved in this browser)" onClose={onClose} wide>
      {!items && <div className="muted">Loading…</div>}
      {items && !items.length && <div className="muted">No saved projects yet. Use File → Save to library (Ctrl+S). Projects also autosave while you work.</div>}
      <div className="project-grid">
        {items?.map((p) => (
          <ProjectCard key={p.id} p={p} onOpen={async () => { await openFromLibrary(p.id); onClose(); }} onDelete={async () => { if (confirmAction(`Delete "${p.name}"?`)) { await deleteFromLibrary(p.id); setItems(await listProjects()); } }} />
        ))}
      </div>
    </Modal>
  );
}

export function ProjectCard({ p, onOpen, onDelete }: { p: ProjectMeta; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="project-card" onClick={onOpen} data-testid="project-card">
      <div className="pthumb checker"><img src={p.thumb} alt="" /></div>
      <div className="pinfo">
        <div className="pname">{p.name}</div>
        <div className="muted small">{p.width}×{p.height} · {new Date(p.updated).toLocaleString()}</div>
      </div>
      <button className="icon-btn tiny pdelete" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={13} /></button>
    </div>
  );
}

function FrameDialog({ onClose }: { onClose: () => void }) {
  const [padding, setPadding] = useState(64);
  const [radius, setRadius] = useState(14);
  const [shadow, setShadow] = useState(true);
  const [c1, setC1] = useState('#a78bfa');
  const [c2, setC2] = useState('#f472b6');
  const [angle, setAngle] = useState(135);
  const presets = [['#a78bfa', '#f472b6'], ['#22d3ee', '#3b82f6'], ['#fde68a', '#f97316'], ['#86efac', '#14b8a6'], ['#e5e7eb', '#9ca3af'], ['#1f2937', '#111827']];
  return (
    <Modal title="Screenshot frame" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" data-testid="frame-apply" onClick={() => { editor.frameScreenshot({ padding, radius, shadow, c1, c2, angle }); onClose(); }}>Apply</button></>}>
      <p className="muted small">Wraps the selected (or first) image in a gradient background with padding, rounded corners and a soft shadow.</p>
      <Slider label="Padding" min={0} max={300} value={padding} onChange={setPadding} suffix="px" />
      <Slider label="Corner radius" min={0} max={80} value={radius} onChange={setRadius} suffix="px" />
      <Toggle checked={shadow} onChange={setShadow} label="Drop shadow" />
      <div className="sub-title">Background</div>
      <div className="btn-row">
        {presets.map(([a, b]) => (
          <button key={a + b} className="grad-chip" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => { setC1(a); setC2(b); }} />
        ))}
      </div>
      <Row label="Colours"><ColorInput value={c1} onChange={setC1} /><ColorInput value={c2} onChange={setC2} /></Row>
      <Slider label="Angle" min={0} max={360} value={angle} onChange={setAngle} suffix="°" />
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
  ['Ctrl+C / X / V', 'Copy / Cut / Paste (images paste from clipboard too)'],
  ['Ctrl+Shift+C', 'Copy selection or canvas as PNG'],
  ['Ctrl+D', 'Duplicate layer (or deselect pixels)'],
  ['Delete', 'Delete layer / remove selected object area'],
  ['Ctrl+A', 'Select all layers (or all pixels with selection tools)'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / Ungroup'],
  ['Ctrl+] / Ctrl+[', 'Bring forward / Send backward (+Shift: front/back)'],
  ['Arrows (+Shift)', 'Nudge 1px (10px)'],
  ['Ctrl+S / Ctrl+Shift+S', 'Save to library / Download project file'],
  ['Ctrl+O / Ctrl+Shift+O', 'Open image / Open project'],
  ['Ctrl+E', 'Export'],
  ['Ctrl+N', 'New document'],
  ['Ctrl+Shift+B', 'Batch processing'],
  ['Ctrl+0 / Ctrl+1', 'Fit to screen / 100%'],
  ['Ctrl + wheel, + / -', 'Zoom'],
  ['Space + drag, middle mouse, wheel', 'Pan'],
  ['Enter / Esc', 'Apply / cancel crop; Esc deselects'],
  ['[ / ]', 'Brush or stroke size'],
  ['Shift-drag', 'Constrain proportions / snap angle'],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const toolNames: Record<string, string> = { select: 'Select', hand: 'Hand', crop: 'Crop', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', pen: 'Pen', highlighter: 'Highlighter', highlight: 'Highlight box', blur: 'Blur', pixelate: 'Pixelate', redact: 'Redact', counter: 'Step number', marquee: 'Rect select', lasso: 'Lasso', wand: 'Magic wand', brushSelect: 'Brush select', eyedropper: 'Eyedropper' };
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="shortcut-grid">
        <div>
          <div className="sub-title">Tools</div>
          {Object.entries(TOOL_KEYS).map(([k, t]) => (
            <div key={k} className="sc"><kbd>{k.toUpperCase()}</kbd><span>{toolNames[t]}</span></div>
          ))}
        </div>
        <div>
          <div className="sub-title">Commands</div>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="sc"><kbd>{k}</kbd><span>{v}</span></div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About PhotoMahnoor" onClose={onClose}>
      <p>A lightweight browser image editor combining layer-based photo editing, design tools and screenshot annotation. Everything runs locally in your browser – your images are never uploaded.</p>
      <div className="sub-title">AI features</div>
      <ul className="small">
        <li><b>Background removal & subject selection</b>: ISNet segmentation model via <code>@imgly/background-removal</code> (ONNX Runtime Web). Downloaded once from the imgly CDN, then cached. Falls back to an offline colour-key algorithm if unavailable.</li>
        <li><b>Object removal</b>: built-in multi-scale content-aware fill (diffusion + patch matching), no download needed.</li>
        <li><b>Smart selection</b>: magic wand (colour similarity), lasso, brush, and AI subject selection.</li>
      </ul>
      <div className="sub-title">ChatGPT subscription</div>
      <p className="small">OpenAI's “Sign in with ChatGPT” lets some approved apps bill usage to a ChatGPT plan, but it is a limited developer preview that needs a registered OAuth client ID, and per OpenAI does not turn a subscription into a general API. So this app uses free in-browser models instead and needs no account or API key. See README for details.</p>
    </Modal>
  );
}
