import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { WebWallGlAdapter, type MountOptions } from './features/live-preview/adapter';
import './preview.css';

const host = document.getElementById('preview');
let engine: WebWallGlAdapter | null = null;
let generation = 0;
let manuallyPaused = false;
let audioEnabled = true;
let audioVolume = 1;
let currentDescriptor: PreviewDescriptor | null = null;
let mountOptions: MountOptions = {};
let qualityTimer = 0;

function syncPlayback() {
  const inactive = manuallyPaused || document.hidden;
  engine?.setVolume(!inactive && audioEnabled ? Math.max(0, Math.min(1, audioVolume)) : 0);
  if (inactive) engine?.pause();
  else engine?.resume();
}

function reportQuality() {
  const state = engine?.getQualityState();
  if (state) window.parent.postMessage({ type: 'wm-preview-quality', ...state }, '*');
}

function startQualityReporting() {
  window.clearInterval(qualityTimer);
  reportQuality();
  qualityTimer = window.setInterval(reportQuality, 1000);
}

async function mountCurrent() {
  if (!host || !currentDescriptor) return;
  const descriptor = currentDescriptor;
  const options = mountOptions;
  const current = ++generation;
  window.clearInterval(qualityTimer);
  if (engine) await engine.unmount();
  const next = new WebWallGlAdapter();
  engine = next;
  try {
    await next.mount(host, descriptor, options);
    if (current !== generation) await next.unmount();
    else { syncPlayback(); startQualityReporting(); }
  } catch {
    if (current === generation) window.parent.postMessage({ type: 'wm-preview-error', message: '壁纸渲染失败' }, '*');
  }
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
    if (event.data.fit === 'contain' || event.data.fit === 'cover') {
      mountOptions = { ...mountOptions, fit: event.data.fit };
      engine?.setFit(event.data.fit);
    }
    return;
  }
  if (event.data?.type === 'wm-preview-auto-quality') {
    const enabled = Boolean(event.data.enabled);
    if ((mountOptions.autoQuality !== false) === enabled) return;
    mountOptions = { ...mountOptions, autoQuality: enabled };
    void mountCurrent();
    return;
  }
  if (event.data?.type !== 'wm-preview-mount') return;
  currentDescriptor = event.data.descriptor as PreviewDescriptor;
  mountOptions = event.data.options || {};
  void mountCurrent();
});
document.addEventListener('visibilitychange', syncPlayback);
window.addEventListener('pagehide', () => { window.clearInterval(qualityTimer); generation++; if (engine) void engine.unmount(); });
