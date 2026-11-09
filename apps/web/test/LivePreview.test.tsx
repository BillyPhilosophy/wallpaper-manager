// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { LivePreview } from '../src/features/live-preview/LivePreview';
const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'webwallgl', type: 'scene', entry: 'scene.pkg', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };
describe('LivePreview', () => {
  afterEach(() => cleanup());
  it('grants the sandbox flags WebWallGL needs to render and interact', () => {
    const view = render(<LivePreview descriptor={descriptor}/>);
    const frame = view.getByLabelText('WebWallGL 实时预览') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-pointer-lock');
    expect(frame.getAttribute('src')).toBe('/preview.html');
    fireEvent.load(frame);
    view.unmount();
  });

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
