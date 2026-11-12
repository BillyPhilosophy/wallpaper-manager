import { useEffect, useRef, useState } from 'react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { OfficialPreview } from '../../components/OfficialPreview';

export function LivePreview({ descriptor, background = false, paused = false }: { descriptor: PreviewDescriptor; background?: boolean; paused?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const postDescriptor = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-mount', descriptor, options: background ? { fit: 'cover', fps: 30, interactive: false } : undefined }, '*');
  };
  const postPaused = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-pause', paused }, '*');
  };
  useEffect(() => {
    setError('');
    if (descriptor.mode === 'official-preview' || descriptor.mode === 'local-video') return;
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === 'wm-preview-error') setError(String(event.data.message || '壁纸渲染失败'));
    };
    window.addEventListener('message', receive);
    postDescriptor();
    return () => window.removeEventListener('message', receive);
  }, [descriptor.workshopId, descriptor.entry, descriptor.mode]);
  useEffect(() => {
    postPaused();
  }, [paused, descriptor.workshopId]);
  useEffect(() => {
    if (!background || descriptor.mode !== 'local-video') return;
    const sync = () => {
      const player = video.current;
      if (!player) return;
      if (paused || document.hidden) player.pause();
      else void player.play().catch(() => undefined);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [background, paused, descriptor.mode, descriptor.workshopId]);
  if (descriptor.mode === 'official-preview' || error) {
    if (background) return null;
    return <div><OfficialPreview url={descriptor.fallbackPreviewUrl} title="官方预览" /><p className="notice">{error ? `实时预览已降级：${error}` : descriptor.message}</p></div>;
  }
  if (descriptor.mode === 'local-video' && descriptor.resourceBaseUrl && descriptor.entry) {
    const source = `${descriptor.resourceBaseUrl.replace(/\/$/, '')}/${descriptor.entry.split('/').map(encodeURIComponent).join('/')}`;
    return <video ref={video} className={`preview local-video${background ? ' background-renderer' : ''}`} src={source} controls={!background} autoPlay={background && !paused} muted={background} loop={background} playsInline preload={background ? 'metadata' : 'none'} aria-label={background ? undefined : '本地视频实时预览'} onError={() => setError('本地视频加载失败')}/>;
  }
  return <iframe ref={frame} className={`live-preview live-preview-frame${background ? ' background-renderer' : ''}`} src="/preview.html" sandbox={background ? 'allow-scripts allow-same-origin' : 'allow-scripts allow-same-origin allow-pointer-lock'} aria-label={background ? undefined : 'WebWallGL 实时预览'} tabIndex={background ? -1 : undefined} onLoad={() => { postDescriptor(); postPaused(); }}/>;
}
