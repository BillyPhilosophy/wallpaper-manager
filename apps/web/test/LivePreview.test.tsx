// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { LivePreview } from '../src/features/live-preview/LivePreview';
const release = vi.fn(); const destroy = vi.fn(); const unmount = vi.fn(async () => { release(); destroy(); });
vi.mock('../src/features/live-preview/adapter', () => ({ WebWallGlAdapter: class { mount = vi.fn(async () => undefined); unmount = unmount; pause = vi.fn(); resume = vi.fn(); } }));
const descriptor: PreviewDescriptor = { workshopId: '1', mode: 'webwallgl', type: 'scene', entry: 'scene.pkg', resourceBaseUrl: '/api/wallpapers/1/resources', fallbackPreviewUrl: null, degraded: false, message: null };
describe('LivePreview', () => { it('releases engine on unmount', async () => { const view = render(<LivePreview descriptor={descriptor}/>); await waitFor(() => expect(view.getByLabelText('WebWallGL 实时预览')).toBeTruthy()); view.unmount(); await waitFor(() => expect(unmount).toHaveBeenCalled()); expect(release).toHaveBeenCalled(); expect(destroy).toHaveBeenCalled(); }); });
