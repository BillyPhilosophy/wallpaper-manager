import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { browserCacheUsage, clearBrowserCache, prepareBrowserCache, setBrowserCacheEnabled, type BrowserCacheUsage } from './client';

interface BrowserCacheValue {
  enabled: boolean;
  supported: boolean;
  error: string;
  usage: BrowserCacheUsage;
  setEnabled: (enabled: boolean) => void;
  prepare: (workshopId: string, version: string) => Promise<void>;
  refreshUsage: () => Promise<void>;
  clear: () => Promise<void>;
}

const emptyUsage = { bytes: 0, entries: 0 };
const storageKey = 'wallpaper-browser-cache-enabled';
const BrowserCacheContext = createContext<BrowserCacheValue>({
  enabled: false,
  supported: false,
  error: '',
  usage: emptyUsage,
  setEnabled: () => undefined,
  prepare: async () => undefined,
  refreshUsage: async () => undefined,
  clear: async () => undefined,
});

export function BrowserCacheProvider({ children }: { children: React.ReactNode }) {
  const supported = 'serviceWorker' in navigator && 'caches' in window && 'indexedDB' in window;
  const [enabled, setEnabledState] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true'; } catch { return false; }
  });
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<BrowserCacheUsage>(emptyUsage);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === storageKey) setEnabledState(event.newValue === 'true');
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(enabled)); } catch { }
    if (!supported) return;
    setBrowserCacheEnabled(enabled).catch(() => setError('浏览器缓存服务不可用，本次将继续从服务器加载'));
  }, [enabled, supported]);

  const setEnabled = useCallback((value: boolean) => {
    setError('');
    if (value && supported) void navigator.storage?.persist().catch(() => false);
    setEnabledState(value);
  }, [supported]);
  const prepare = useCallback(async (workshopId: string, version: string) => {
    if (!enabled || !supported) return;
    try { await prepareBrowserCache(workshopId, version); }
    catch { setError('浏览器缓存服务不可用，本次将继续从服务器加载'); }
  }, [enabled, supported]);
  const refreshUsage = useCallback(async () => {
    if (!supported) return;
    try { setUsage(await browserCacheUsage()); } catch { }
  }, [supported]);
  const clear = useCallback(async () => {
    setError('');
    try { await clearBrowserCache(); setUsage(emptyUsage); }
    catch { setError('清除浏览器缓存失败，请稍后重试'); }
  }, []);
  const value = useMemo(() => ({ enabled, supported, error, usage, setEnabled, prepare, refreshUsage, clear }), [enabled, supported, error, usage, setEnabled, prepare, refreshUsage, clear]);
  return <BrowserCacheContext.Provider value={value}>{children}</BrowserCacheContext.Provider>;
}

export function useBrowserCache(): BrowserCacheValue {
  return useContext(BrowserCacheContext);
}
