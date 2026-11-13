// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { mount, type SceneInstance } from 'webwallgl';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { WebWallGlAdapter } from '../src/features/live-preview/adapter';

vi.mock('webwallgl', () => ({ httpSource: vi.fn((base: string) => ({ base })), mount: vi.fn() }));

const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'webwallgl', type: 'scene', entry: 'scene.pkg', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };
let instance: SceneInstance;

describe('WebWallGlAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    instance = { pushPointer: vi.fn(), pointerLeave: vi.fn(), release: vi.fn(), destroy: vi.fn(), pause: vi.fn(), resume: vi.fn(), setVolume: vi.fn() } as unknown as SceneInstance;
    vi.mocked(mount).mockResolvedValue(instance);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('uses legacy web sandbox and forwards normalized scene pointer events', async () => {
    const adapter = new WebWallGlAdapter();
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect;
    await adapter.mount(container, descriptor);
    expect(vi.mocked(mount).mock.calls[0][1]).toMatchObject({ fit: 'contain', scripts: true, webSandbox: 'legacy' });

    fireEvent.mouseMove(container, { clientX: 110, clientY: 70, buttons: 0 });
    expect(instance.pushPointer).toHaveBeenLastCalledWith(0.5, 0.5, 0);
    fireEvent.mouseDown(container, { clientX: 110, clientY: 70, button: 0 });
    expect(instance.pushPointer).toHaveBeenLastCalledWith(0.5, 0.5, 1);
    fireEvent.mouseUp(window, { clientX: 110, clientY: 70, button: 0 });
    expect(instance.pushPointer).toHaveBeenLastCalledWith(0.5, 0.5, 1);
    await vi.advanceTimersByTimeAsync(20);
    expect(instance.pushPointer).toHaveBeenLastCalledWith(0.5, 0.5, 0);

    fireEvent.mouseLeave(container);
    expect(instance.pointerLeave).toHaveBeenCalledOnce();
    const calls = vi.mocked(instance.pushPointer).mock.calls.length;
    await adapter.unmount();
    fireEvent.mouseMove(container, { clientX: 150, clientY: 80 });
    expect(instance.pushPointer).toHaveBeenCalledTimes(calls);
    expect(instance.release).toHaveBeenCalledOnce();
    expect(instance.destroy).toHaveBeenCalledWith({ releasePkgCache: true });
  });

  it('uses a noninteractive, cover-fit background profile', async () => {
    const adapter = new WebWallGlAdapter();
    const container = document.createElement('div');
    await adapter.mount(container, descriptor, { fit: 'cover', fps: 30, interactive: false });
    expect(vi.mocked(mount).mock.calls[0][1]).toMatchObject({ fit: 'cover', fps: 30 });
    fireEvent.mouseMove(container, { clientX: 20, clientY: 20 });
    expect(instance.pushPointer).not.toHaveBeenCalled();
    adapter.setVolume(1);
    expect(instance.setVolume).toHaveBeenCalledWith(1);
    adapter.setVolume(0);
    expect(instance.setVolume).toHaveBeenCalledWith(0);
    await adapter.unmount();
  });
});
