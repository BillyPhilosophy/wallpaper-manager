import { useEffect, useRef, useState } from 'react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { OfficialPreview } from '../../components/OfficialPreview';

export function LivePreview({ descriptor }: { descriptor: PreviewDescriptor }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState('');
  const postDescriptor = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-mount', descriptor }, '*');
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
  if (descriptor.mode === 'official-preview' || error) return <div><OfficialPreview url={descriptor.fallbackPreviewUrl} title="官方预览" /><p className="notice">{error ? `实时预览已降级：${error}` : descriptor.message}</p></div>;
  if (descriptor.mode === 'local-video' && descriptor.resourceBaseUrl && descriptor.entry) {
    const source = `${descriptor.resourceBaseUrl.replace(/\/$/, '')}/${descriptor.entry.split('/').map(encodeURIComponent).join('/')}`;
    return <video className="preview local-video" src={source} controls playsInline preload="none" aria-label="本地视频实时预览" onError={() => setError('本地视频加载失败')}/>;
  }
  return <iframe ref={frame} className="live-preview live-preview-frame" src="/preview.html" sandbox="allow-scripts" aria-label="WebWallGL 实时预览" onLoad={postDescriptor}/>;
}
