// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { LivePreview } from '../src/features/live-preview/LivePreview';
import { BrowserCacheProvider } from '../src/features/browser-cache/BrowserCacheContext';
import { prepareBrowserCache } from '../src/features/browser-cache/client';

vi.mock('../src/features/browser-cache/client', () => ({
  prepareBrowserCache: vi.fn().mockResolvedValue(undefined),
  setBrowserCacheEnabled: vi.fn().mockResolvedValue(undefined),
  browserCacheUsage: vi.fn().mockResolvedValue({ bytes: 0, entries: 0 }),
  clearBrowserCache: vi.fn().mockResolvedValue(undefined),
}));

const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'local-video', type: 'video', entry: 'video.mp4', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };

describe('video-only cache scope', () => {
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('marks only foreground video previews for the video cache', async () => {
    localStorage.setItem('wallpaper-video-cache-enabled', 'true');
    Object.defineProperty(window, 'caches', { configurable: true, value: {} });
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: {} });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const view = render(<BrowserCacheProvider><LivePreview descriptor={descriptor} cacheVersion="2026-01-01T00:00:00.000Z"/></BrowserCacheProvider>);
    await waitFor(() => expect(view.getByLabelText('本地视频实时预览').getAttribute('src')).toBe('/api/wallpapers/1/resources/video.mp4?wm-video-cache=1'));
    expect(prepareBrowserCache).toHaveBeenCalledWith('1', '2026-01-01T00:00:00.000Z');

    view.rerender(<BrowserCacheProvider><LivePreview descriptor={descriptor} background cacheVersion="2026-01-01T00:00:00.000Z"/></BrowserCacheProvider>);
    expect(view.container.querySelector('video')?.getAttribute('src')).toBe('/api/wallpapers/1/resources/video.mp4');
    expect(prepareBrowserCache).toHaveBeenCalledTimes(1);
  });
});
