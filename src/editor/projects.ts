// Project persistence: IndexedDB library (autosave + recent projects) and .pmproj file import/export
import { editor, type ProjectFile } from './editor';
import { useStore } from '../store';
import { canvasToBlob, blobToDataURL } from '../lib/imageOps';

const DB_NAME = 'photomahnoor';
const STORE = 'projects';

export interface ProjectMeta {
  id: string;
  name: string;
  updated: number;
  width: number;
  height: number;
  thumb: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function makeThumb(): Promise<string> {
  const scale = Math.min(1, 320 / Math.max(editor.doc.width, editor.doc.height));
  const c = await editor.renderDoc({ scale });
  return blobToDataURL(await canvasToBlob(c, 'image/webp', 0.7));
}

export async function saveToLibrary(silent = false) {
  try {
    const project = await editor.toProject();
    const thumb = await makeThumb();
    const rec = {
      id: editor.projectId,
      name: editor.doc.name || 'Untitled',
      updated: Date.now(),
      width: editor.doc.width,
      height: editor.doc.height,
      thumb,
      project,
    };
    await tx('readwrite', (s) => s.put(rec));
    useStore.setState({ dirty: false });
    if (!silent) useStore.getState().toast('Project saved in browser library', 'success');
  } catch (e) {
    console.error(e);
    if (!silent) useStore.getState().toast('Could not save to library: ' + (e as Error).message, 'error');
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const all = (await tx('readonly', (s) => s.getAll())) as any[];
    return all
      .map(({ id, name, updated, width, height, thumb }) => ({ id, name, updated, width, height, thumb }))
      .sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

export async function openFromLibrary(id: string) {
  const rec = (await tx('readonly', (s) => s.get(id))) as any;
  if (!rec) throw new Error('Project not found');
  await editor.loadProject(rec.project, rec.id);
}

export async function deleteFromLibrary(id: string) {
  await tx('readwrite', (s) => s.delete(id));
}

export async function downloadProject() {
  const project = await editor.toProject();
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  downloadBlob(blob, `${safeName(editor.doc.name)}.pmproj`);
  useStore.setState({ dirty: false });
  useStore.getState().toast('Project file downloaded (.pmproj)', 'success');
}

export async function openProjectFile(file: File) {
  const text = await file.text();
  const data = JSON.parse(text) as ProjectFile;
  await editor.loadProject(data);
  editor.setDoc({ name: data.doc?.name || file.name.replace(/\.[^.]+$/, '') }, false);
}

/** Inside a claude.ai artifact viewer, plain downloads are blocked; use its downloads capability. */
async function hostDownload(blob: Blob, name: string): Promise<boolean> {
  const c = (window as any).claude;
  if (!c?.use) return false;
  try {
    const dl = await c.use('downloads');
    if (!dl) return false;
    const filename = name.endsWith('.pmproj') ? name + '.json' : name;
    await dl.save({ filename, data: blob });
    return true;
  } catch (e: any) {
    if (e?.code === 'declined') return true;
    return false;
  }
}

export async function downloadBlob(blob: Blob, name: string) {
  if (await hostDownload(blob, name)) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function safeName(n: string) {
  return (n || 'untitled').replace(/[^\w\-. ]+/g, '_').trim() || 'untitled';
}

// autosave every few seconds after changes
let autosaveTimer: number | undefined;
export function scheduleAutosave() {
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    if (useStore.getState().started && editor.objects().length) saveToLibrary(true);
  }, 2500);
}
