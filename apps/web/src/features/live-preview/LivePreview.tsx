import { useEffect, useRef, useState } from 'react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { OfficialPreview } from '../../components/OfficialPreview';
import { WebWallGlAdapter } from './adapter';
export function LivePreview({ descriptor }: { descriptor: PreviewDescriptor }) {
  const host = useRef<HTMLDivElement>(null); const adapter = useRef<WebWallGlAdapter | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (descriptor.mode === 'official-preview' || descriptor.mode === 'local-video') return;
    let alive = true; const engine = new WebWallGlAdapter(); adapter.current = engine;
    if (host.current) engine.mount(host.current, descriptor).catch((reason) => { if (alive) setError(reason?.message || 'WebWallGL 初始化失败'); });
    const visibility = () => document.hidden ? engine.pause() : engine.resume(); document.addEventListener('visibilitychange', visibility);
    return () => { alive = false; document.removeEventListener('visibilitychange', visibility); void engine.unmount(); adapter.current = null; };
  }, [descriptor.workshopId, descriptor.entry, descriptor.mode]);
  if (descriptor.mode === 'official-preview' || error) return <div><OfficialPreview url={descriptor.fallbackPreviewUrl} title="官方预览" /><p className="notice">{error ? `实时预览已降级：${error}` : descriptor.message}</p></div>;
  if (descriptor.mode === 'local-video' && descriptor.resourceBaseUrl && descriptor.entry) {
    const source = `${descriptor.resourceBaseUrl.replace(/\/$/, '')}/${descriptor.entry.split('/').map(encodeURIComponent).join('/')}`;
    return <video className="preview local-video" src={source} controls playsInline preload="none" aria-label="本地视频实时预览" onError={() => setError('本地视频加载失败')}/>;
  }
  return <div className="live-preview" ref={host} aria-label="WebWallGL 实时预览" />;
}
