import { useEffect, useState } from 'react';
import { useBrowserCache } from './BrowserCacheContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BrowserCachePanel() {
  const { supported, error, usage, refreshUsage, clear } = useBrowserCache();
  const [clearing, setClearing] = useState(false);
  useEffect(() => { void refreshUsage(); }, [refreshUsage]);
  const runClear = async () => {
    setClearing(true);
    try { await clear(); await refreshUsage(); }
    finally { setClearing(false); }
  };
  return <article className="settings-card">
    <h2>浏览器缓存</h2>
    <p>浏览器缓存暂时停用，实时预览和动态背景均从服务器加载。已有缓存仍可保留或清除。</p>
    <label className="content-filter-toggle"><input type="checkbox" role="switch" checked={false} disabled readOnly/>浏览器缓存暂不可用</label>
    {!supported && <p>当前浏览器不支持 Service Worker 或 Cache Storage，无法管理已有缓存。</p>}
    <div className="setting-row"><span>缓存占用</span><strong>{formatBytes(usage.bytes)} · {usage.entries} 个文件</strong></div>
    <button type="button" className="secondary" disabled={!supported || clearing} onClick={() => void runClear()}>{clearing ? '正在清除…' : '清除浏览器缓存'}</button>
    <p>清除仅释放当前设备和浏览器中的壁纸缓存，不会删除服务器壁纸。</p>
    {error && <p className="error-text">{error}</p>}
  </article>;
}
