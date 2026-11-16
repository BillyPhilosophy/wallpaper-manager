import { useEffect, useState } from 'react';
import { useBrowserCache } from './BrowserCacheContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BrowserCachePanel() {
  const { enabled, supported, error, usage, setEnabled, refreshUsage, clear } = useBrowserCache();
  const [clearing, setClearing] = useState(false);
  useEffect(() => { if (enabled) void refreshUsage(); }, [enabled, refreshUsage]);
  const runClear = async () => {
    setClearing(true);
    try { await clear(); await refreshUsage(); }
    finally { setClearing(false); }
  };
  return <article className="settings-card">
    <h2>浏览器缓存</h2>
    <p>默认关闭。开启后，实时预览和动态背景优先读取此浏览器中的源文件；未命中或壁纸更新后才会重新从服务器下载。</p>
    <label className="content-filter-toggle"><input type="checkbox" role="switch" checked={enabled && supported} disabled={!supported} onChange={(event) => setEnabled(event.target.checked)}/>在此浏览器中缓存壁纸资源</label>
    {!supported && <p>当前浏览器不支持 Service Worker 或 Cache Storage，无法使用此功能。</p>}
    <div className="setting-row"><span>缓存占用</span><strong>{formatBytes(usage.bytes)} · {usage.entries} 个文件</strong></div>
    <button type="button" className="secondary" disabled={!supported || clearing} onClick={() => void runClear()}>{clearing ? '正在清除…' : '清除浏览器缓存'}</button>
    <p>缓存仅在当前设备和浏览器中有效，不会同步到其他设备。清除也会使正在下载的旧缓存任务失效。清除服务器壁纸不会自动清除浏览器缓存，可在此处手动释放空间。</p>
    {error && <p className="error-text">{error}</p>}
  </article>;
}
