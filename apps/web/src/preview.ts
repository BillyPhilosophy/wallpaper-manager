import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { WebWallGlAdapter } from './features/live-preview/adapter';
import './preview.css';

const host = document.getElementById('preview');
let engine: WebWallGlAdapter | null = null;
let generation = 0;
let manuallyPaused = false;
let audioEnabled = true;
let audioVolume = 1;

function syncPlayback() {
  const inactive = manuallyPaused || document.hidden;
  engine?.setVolume(!inactive && audioEnabled ? Math.max(0, Math.min(1, audioVolume)) : 0);
  if (inactive) engine?.pause();
  else engine?.resume();
}

window.addEventListener('message', (event) => {
  if (!host || event.source !== window.parent) return;
  if (event.data?.type === 'wm-preview-pause') {
    manuallyPaused = Boolean(event.data.paused);
    syncPlayback();
    return;
  }
  if (event.data?.type === 'wm-preview-audio') {
    audioEnabled = Boolean(event.data.enabled);
    if (typeof event.data.volume === 'number') audioVolume = event.data.volume;
    syncPlayback();
    return;
  }
  if (event.data?.type === 'wm-preview-fit') {
    if (event.data.fit === 'contain' || event.data.fit === 'cover') engine?.setFit(event.data.fit);
    return;
  }
  if (event.data?.type !== 'wm-preview-mount') return;
  const descriptor = event.data.descriptor as PreviewDescriptor;
  const current = ++generation;
  void (async () => {
    if (engine) await engine.unmount();
    const next = new WebWallGlAdapter();
    engine = next;
    try {
      await next.mount(host, descriptor, event.data.options);
      if (current !== generation) await next.unmount();
      else syncPlayback();
    } catch {
      if (current === generation) window.parent.postMessage({ type: 'wm-preview-error', message: '壁纸渲染失败' }, '*');
    }
  })();
});
document.addEventListener('visibilitychange', syncPlayback);
window.addEventListener('pagehide', () => { generation++; if (engine) void engine.unmount(); });
