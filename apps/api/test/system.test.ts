import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemController } from '../src/system/system.controller';

describe('system capabilities', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses the worker health endpoint instead of treating Redis as the worker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new SystemController({ db: { steamAuthState: { findUnique: vi.fn().mockResolvedValue(null) } } } as any);
    expect((await controller.capabilities()).workerReady).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://worker:9780/health', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('reports worker unavailable when its health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const controller = new SystemController({ db: { steamAuthState: { findUnique: vi.fn().mockResolvedValue(null) } } } as any);
    expect((await controller.capabilities()).workerReady).toBe(false);
  });
});
