// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';

const engine = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn(), pause: vi.fn(), resume: vi.fn(), setVolume: vi.fn(), setFit: vi.fn(), getQualityState: vi.fn(() => ({ antiAliasing: 'off', particles: 'high', postProcessing: 'high', fps: 45, running: true })) }));
vi.mock('../src/features/live-preview/adapter', () => ({
  WebWallGlAdapter: class {
    mount = engine.mount;
    unmount = engine.unmount;
    pause = engine.pause;
    resume = engine.resume;
    setVolume = engine.setVolume;
    setFit = engine.setFit;
    getQualityState = engine.getQualityState;
  },
}));

const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'webwallgl', type: 'scene', entry: 'scene.pkg', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };
const message = (data: object) => fireEvent(window, new MessageEvent('message', { source: window, data }));

describe('preview runtime audio', () => {
  it('allows audio only when enabled, visible, and not manually paused', async () => {
    document.body.innerHTML = '<div id="preview"></div>';
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    await import('../src/preview');
    message({ type: 'wm-preview-mount', descriptor });
    await waitFor(() => expect(engine.mount).toHaveBeenCalledOnce());
    expect(engine.setVolume).toHaveBeenLastCalledWith(1);

    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    expect(engine.setVolume).toHaveBeenLastCalledWith(0);
    expect(engine.pause).toHaveBeenCalled();

    message({ type: 'wm-preview-audio', enabled: true });
    expect(engine.setVolume).toHaveBeenLastCalledWith(0);
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(engine.setVolume).toHaveBeenLastCalledWith(1);

    message({ type: 'wm-preview-audio', enabled: false });
    expect(engine.setVolume).toHaveBeenLastCalledWith(0);
    message({ type: 'wm-preview-audio', enabled: true });
    message({ type: 'wm-preview-pause', paused: true });
    expect(engine.setVolume).toHaveBeenLastCalledWith(0);
    message({ type: 'wm-preview-pause', paused: false });
    expect(engine.setVolume).toHaveBeenLastCalledWith(1);
    message({ type: 'wm-preview-audio', enabled: true, volume: 0.5 });
    expect(engine.setVolume).toHaveBeenLastCalledWith(0.5);
    message({ type: 'wm-preview-fit', fit: 'cover' });
    expect(engine.setFit).toHaveBeenCalledWith('cover');
    message({ type: 'wm-preview-auto-quality', enabled: false });
    await waitFor(() => expect(engine.mount).toHaveBeenCalledTimes(2));
    expect(engine.mount.mock.calls[1][2]).toMatchObject({ fit: 'cover', autoQuality: false });
  });
});
