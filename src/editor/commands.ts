// Shared commands used by menus, toolbar and keyboard shortcuts
import { editor } from './editor';
import { useStore } from '../store';
import { downloadProject, openProjectFile, saveToLibrary } from './projects';

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.onchange = () => {
      res(Array.from(input.files || []));
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

export async function openImages() {
  const files = await pickFiles('image/*', true);
  if (!files.length) return;
  ensureStarted();
  await editor.addImageFiles(files);
}

export async function openProject() {
  const files = await pickFiles('.pmproj,.json,application/json');
  if (!files.length) return;
  await loadProjectFile(files[0]);
}

export async function loadProjectFile(f: File) {
  try {
    useStore.setState({ busy: { message: 'Opening project…' } });
    await openProjectFile(f);
    useStore.getState().toast(`Opened ${f.name}`, 'success');
  } catch (e) {
    useStore.getState().toast('Could not open project: ' + (e as Error).message, 'error');
  } finally {
    useStore.setState({ busy: null });
  }
}

/** Open dropped/pasted files of any supported kind */
export async function openAnyFiles(files: File[]) {
  const proj = files.find((f) => /\.(pmproj|json)$/i.test(f.name));
  if (proj) return loadProjectFile(proj);
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) {
    useStore.getState().toast('Unsupported file type', 'error');
    return;
  }
  ensureStarted();
  await editor.addImageFiles(imgs);
}

export function ensureStarted() {
  if (!useStore.getState().started) {
    editor.newDocument(1280, 720, '#ffffff', 'Untitled', true);
  }
}

export const save = () => saveToLibrary(false);
export const saveAs = () => downloadProject();

export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
    // fabric's hidden textarea while editing text
    return true;
  }
  const a = editor.canvas?.getActiveObject() as any;
  return !!a?.isEditing;
}
