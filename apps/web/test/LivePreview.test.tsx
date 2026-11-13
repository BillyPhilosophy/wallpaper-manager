// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { LivePreview } from '../src/features/live-preview/LivePreview';
const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'webwallgl', type: 'scene', entry: 'scene.pkg', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };
const videoDescriptor: PreviewDescriptor = { ...descriptor, mode: 'local-video', type: 'video', entry: 'nested/video file.mp4', fallbackPreviewUrl: 'https://example.test/official.mp4' };
describe('LivePreview', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it('grants the sandbox flags WebWallGL needs to render and interact', () => {
    const view = render(<LivePreview descriptor={descriptor}/>);
    const frame = view.getByLabelText('WebWallGL 实时预览') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-pointer-lock');
    expect(frame.getAttribute('src')).toBe('/preview.html');
    fireEvent.load(frame);
    expect(post).toHaveBeenCalledWith({ type: 'wm-preview-audio', enabled: true }, '*');
    view.unmount();
  });

  it('plays local video without mounting WebWallGL and falls back only on playback failure', () => {
    const view = render(<LivePreview descriptor={videoDescriptor}/>);
    const player = view.getByLabelText('本地视频实时预览') as HTMLVideoElement;
    expect(player.getAttribute('src')).toBe('/api/wallpapers/1/resources/nested/video%20file.mp4');
    expect(player.muted).toBe(false);
    expect(view.queryByLabelText('WebWallGL 实时预览')).toBeNull();
    fireEvent.error(player);
    expect(view.getByText('实时预览已降级：本地视频加载失败')).toBeTruthy();
    expect(view.getByLabelText('官方预览').getAttribute('src')).toBe('https://example.test/official.mp4');
  });

  it('uses a passive background renderer without pointer lock or controls', () => {
    const view = render(<LivePreview descriptor={descriptor} background paused/>);
    const frame = view.container.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame.getAttribute('tabindex')).toBe('-1');
    expect(frame.classList.contains('background-renderer')).toBe(true);
    view.unmount();
  });

  it('plays source audio by default only while the tab is visible', () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const view = render(<LivePreview descriptor={videoDescriptor} background/>);
    const player = view.container.querySelector('video') as HTMLVideoElement;
    expect(player.muted).toBe(false);
    expect(play).toHaveBeenCalledOnce();

    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    expect(player.muted).toBe(true);
    expect(pause).toHaveBeenCalled();

    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(player.muted).toBe(false);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('keeps video muted while audio is disabled even when visible', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const view = render(<LivePreview descriptor={videoDescriptor} background audioEnabled={false}/>);
    const player = view.container.querySelector('video') as HTMLVideoElement;
    expect(player.muted).toBe(true);
    view.rerender(<LivePreview descriptor={videoDescriptor} background audioEnabled/>);
    expect(player.muted).toBe(false);
  });
});
