import { useEffect, useRef, useState } from 'react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { OfficialPreview } from '../../components/OfficialPreview';
import { useBrowserCache } from '../browser-cache/BrowserCacheContext';
import type { PreviewQualityState } from './adapter';
export type { PreviewQualityState } from './adapter';

export function LivePreview({ descriptor, background = false, paused = false, audioEnabled = true, volume = 1, fit = 'contain', videoControls = true, autoQuality = true, onQualityChange, cacheVersion = '' }: { descriptor: PreviewDescriptor; background?: boolean; paused?: boolean; audioEnabled?: boolean; volume?: number; fit?: 'contain' | 'cover'; videoControls?: boolean; autoQuality?: boolean; onQualityChange?: (state: PreviewQualityState) => void; cacheVersion?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const resumeVideo = useRef(false);
  const qualityCallback = useRef(onQualityChange);
  qualityCallback.current = onQualityChange;
  const { enabled: cacheEnabled, prepare: prepareCache } = useBrowserCache();
  const [cacheReady, setCacheReady] = useState(!cacheEnabled || !cacheVersion);
  const [error, setError] = useState('');
  const postDescriptor = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-mount', descriptor, options: background ? { fit: 'cover', fps: 30, interactive: false, autoQuality } : { fit, autoQuality } }, '*');
  };
  const postPaused = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-pause', paused }, '*');
  };
  const postAudio = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-audio', enabled: audioEnabled, volume }, '*');
  };
  const postFit = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-fit', fit: background ? 'cover' : fit }, '*');
  };
  const postAutoQuality = () => {
    frame.current?.contentWindow?.postMessage({ type: 'wm-preview-auto-quality', enabled: autoQuality }, '*');
  };
  useEffect(() => {
    let active = true;
    if (!cacheEnabled || !cacheVersion || descriptor.mode === 'official-preview') {
      setCacheReady(true);
    } else {
      setCacheReady(false);
      void prepareCache(descriptor.workshopId, cacheVersion).finally(() => { if (active) setCacheReady(true); });
    }
    return () => { active = false; };
  }, [cacheEnabled, cacheVersion, descriptor.workshopId, descriptor.mode, prepareCache]);
  useEffect(() => {
    setError('');
    if (descriptor.mode === 'official-preview' || descriptor.mode === 'local-video') return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'wm-preview-error') setError(String(event.data.message || '壁纸渲染失败'));
      if (event.data?.type === 'wm-preview-quality') qualityCallback.current?.(event.data as PreviewQualityState);
    };
    window.addEventListener('message', receive);
    postDescriptor();
    return () => window.removeEventListener('message', receive);
  }, [descriptor.workshopId, descriptor.entry, descriptor.mode]);
  useEffect(() => {
    postPaused();
  }, [paused, descriptor.workshopId]);
  useEffect(() => {
    if (descriptor.mode === 'official-preview' || descriptor.mode === 'local-video') return;
    postAudio();
    window.addEventListener('pointerdown', postAudio);
    window.addEventListener('keydown', postAudio);
    return () => {
      window.removeEventListener('pointerdown', postAudio);
      window.removeEventListener('keydown', postAudio);
    };
  }, [audioEnabled, volume, descriptor.workshopId, descriptor.mode]);
  useEffect(() => {
    if (descriptor.mode === 'official-preview' || descriptor.mode === 'local-video') return;
    postFit();
  }, [fit, descriptor.workshopId, descriptor.mode]);
  useEffect(() => {
    if (descriptor.mode === 'official-preview' || descriptor.mode === 'local-video') return;
    postAutoQuality();
  }, [autoQuality, descriptor.workshopId, descriptor.mode]);
  useEffect(() => {
    if (descriptor.mode !== 'local-video') return;
    const sync = () => {
      const player = video.current;
      if (!player) return;
      const visible = !document.hidden;
      player.volume = Math.max(0, Math.min(1, volume));
      player.muted = !audioEnabled || !visible;
      if (paused || !visible) {
        if (!player.paused && !player.ended) resumeVideo.current = true;
        player.pause();
      } else if (background || resumeVideo.current) {
        resumeVideo.current = false;
        void player.play().catch(() => undefined);
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pointerdown', sync);
    window.addEventListener('keydown', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointerdown', sync);
      window.removeEventListener('keydown', sync);
    };
  }, [background, paused, audioEnabled, volume, descriptor.mode, descriptor.workshopId]);
  if (!cacheReady && descriptor.mode !== 'official-preview') return background ? null : <div className="loading">正在准备浏览器缓存…</div>;
  if (descriptor.mode === 'official-preview' || error) {
    if (background) return null;
    return <div><OfficialPreview url={descriptor.fallbackPreviewUrl} title="官方预览" /><p className="notice">{error ? `实时预览已降级：${error}` : descriptor.message}</p></div>;
  }
  if (descriptor.mode === 'local-video' && descriptor.resourceBaseUrl && descriptor.entry) {
    const source = `${descriptor.resourceBaseUrl.replace(/\/$/, '')}/${descriptor.entry.split('/').map(encodeURIComponent).join('/')}`;
    return <video ref={video} className={`preview local-video${background ? ' background-renderer' : ''}`} style={{ objectFit: background ? 'cover' : fit }} src={source} controls={!background && videoControls} autoPlay={background && !paused && !document.hidden} muted={!audioEnabled || document.hidden} loop={background} playsInline preload={background ? 'metadata' : 'none'} aria-label={background ? undefined : '本地视频实时预览'} onError={() => setError('本地视频加载失败')}/>;
  }
  return <iframe ref={frame} className={`live-preview live-preview-frame${background ? ' background-renderer' : ''}`} src="/preview.html" sandbox={background ? 'allow-scripts allow-same-origin' : 'allow-scripts allow-same-origin allow-pointer-lock'} aria-label={background ? undefined : 'WebWallGL 实时预览'} tabIndex={background ? -1 : undefined} onLoad={() => { postDescriptor(); postPaused(); postAudio(); postFit(); postAutoQuality(); }}/>;
}
