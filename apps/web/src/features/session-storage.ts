export function readSession<T extends object>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return defaults;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...defaults, ...value } : defaults;
  } catch {
    return defaults;
  }
}

export function writeSession<T extends object>(key: string, value: T): void {
  try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { }
}
