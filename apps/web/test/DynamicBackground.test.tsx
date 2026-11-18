// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { PreviewDescriptor, Wallpaper } from '@wallpaper-manager/contracts';
import { api } from '../src/api';
import { AppearanceProvider } from '../src/features/appearance/AppearanceContext';
import { DynamicBackground } from '../src/features/appearance/DynamicBackground';

vi.mock('../src/api', () => ({ api: vi.fn() }));
const previewProps = vi.hoisted(() => ({ current: null as any }));
vi.mock('../src/features/live-preview/LivePreview', () => ({ LivePreview: (props: any) => { previewProps.current = props; return null; } }));

const wallpapers = ['101', '102'].map((workshopId) => ({ workshopId, type: 'video', status: 'downloaded' })) as Wallpaper[];

function settings(rotationTrigger = 'interval') {
  return { backgroundId: '101', backgroundMode: 'dynamic', rotationEnabled: true, rotationGroupId: 'g1', rotationIntervalMinutes: 1, rotationOrder: 'sequence', rotationTrigger };
}

describe('DynamicBackground rotation', () => {
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.useRealTimers(); });

  it('defers while hidden and advances once when visible', async () => {
    vi.useFakeTimers();
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    localStorage.setItem('wallpaper-appearance-v1', JSON.stringify(settings()));
    vi.mocked(api).mockImplementation(async (url: string) => {
      if (url.startsWith('/wallpapers?')) return { items: wallpapers, page: 1, pageSize: 100, total: 2 };
      const id = url.match(/wallpapers\/(\d+)\/preview-descriptor/)?.[1] || '101';
      return { workshopId: id, mode: 'official-preview', type: 'scene', fallbackPreviewUrl: null, degraded: false, message: null } as PreviewDescriptor;
    });
    render(<AppearanceProvider><DynamicBackground/></AppearanceProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('groupId=g1'));

    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    expect(JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').backgroundId).toBe('101');

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').backgroundId).toBe('102');
  });

  it('stops looping after the minimum interval and advances on video end', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    localStorage.setItem('wallpaper-appearance-v1', JSON.stringify(settings('videoEnd')));
    vi.mocked(api).mockImplementation(async (url: string) => {
      if (url.startsWith('/wallpapers?')) return { items: wallpapers, page: 1, pageSize: 100, total: 2 };
      const id = url.match(/wallpapers\/(\d+)\/preview-descriptor/)?.[1] || '101';
      return { workshopId: id, mode: 'local-video', type: 'video', fallbackPreviewUrl: null, degraded: false, message: null } as PreviewDescriptor;
    });
    render(<AppearanceProvider><DynamicBackground/></AppearanceProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(previewProps.current.backgroundLoop).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    expect(previewProps.current.backgroundLoop).toBe(false);
    expect(JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').backgroundId).toBe('101');
    await act(async () => { previewProps.current.onEnded(); });
    expect(JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').backgroundId).toBe('102');
  });
});
