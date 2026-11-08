const CONTENT_FILTER_KEY = 'wallpaper-content-filter';

export function contentFilterEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(CONTENT_FILTER_KEY) !== 'false'; } catch { return true; }
}

export function setContentFilterEnabled(enabled: boolean): void {
  try { window.localStorage.setItem(CONTENT_FILTER_KEY, enabled ? 'true' : 'false'); } catch { }
}
