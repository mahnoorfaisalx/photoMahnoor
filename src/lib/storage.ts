// localStorage wrappers that never throw (private mode, sandboxed iframes, blocked storage)
export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function setItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** window.confirm, but treated as "yes" inside hosts that suppress dialogs (e.g. sandboxed previews). */
export function confirmAction(message: string): boolean {
  if ((window as any).claude) return true;
  try {
    return window.confirm(message);
  } catch {
    return true;
  }
}
