// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { LivePreview } from '../src/features/live-preview/LivePreview';
const release = vi.fn(); const destroy = vi.fn(); const unmount = vi.fn(async () => { release(); destroy(); });
vi.mock('../src/features/live-preview/adapter', () => ({ WebWallGlAdapter: class { mount = vi.fn(async () => undefined); unmount = unmount; pause = vi.fn(); resume = vi.fn(); } }));
const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'webwallgl', type: 'scene', entry: 'scene.pkg', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };
describe('LivePreview', () => {
  it('releases engine on unmount', async () => { const view = render(<LivePreview descriptor={descriptor}/>); await waitFor(() => expect(view.getByLabelText('WebWallGL 实时预览')).toBeTruthy()); view.unmount(); await waitFor(() => expect(unmount).toHaveBeenCalled()); expect(release).toHaveBeenCalled(); expect(destroy).toHaveBeenCalled(); });

  it('plays local video without mounting WebWallGL and falls back only on playback failure', () => {
    const video: PreviewDescriptor = { ...descriptor, mode: 'local-video', type: 'video', entry: 'nested/video file.mp4', fallbackPreviewUrl: 'https://example.test/official.mp4' };
    const view = render(<LivePreview descriptor={video}/>);
    const player = view.getByLabelText('本地视频实时预览');
    expect(player.getAttribute('src')).toBe('/api/wallpapers/1/resources/nested/video%20file.mp4');
    expect(view.queryByLabelText('WebWallGL 实时预览')).toBeNull();
    fireEvent.error(player);
    expect(view.getByText('实时预览已降级：本地视频加载失败')).toBeTruthy();
    expect(view.getByLabelText('官方预览').getAttribute('src')).toBe('https://example.test/official.mp4');
  });
});
