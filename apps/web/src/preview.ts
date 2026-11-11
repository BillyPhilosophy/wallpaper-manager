import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { WebWallGlAdapter } from './features/live-preview/adapter';
import './preview.css';

const host = document.getElementById('preview');
let engine: WebWallGlAdapter | null = null;
let generation = 0;

window.addEventListener('message', (event) => {
  if (!host || event.source !== window.parent || event.data?.type !== 'wm-preview-mount') return;
  const descriptor = event.data.descriptor as PreviewDescriptor;
  const current = ++generation;
  void (async () => {
    if (engine) await engine.unmount();
    const next = new WebWallGlAdapter();
    engine = next;
    try {
      await next.mount(host, descriptor);
      if (current !== generation) await next.unmount();
    } catch {
      if (current === generation) window.parent.postMessage({ type: 'wm-preview-error', message: '壁纸渲染失败' }, '*');
    }
  })();
});
window.addEventListener('pagehide', () => { generation++; if (engine) void engine.unmount(); });
