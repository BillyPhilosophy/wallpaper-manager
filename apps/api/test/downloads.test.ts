import { afterEach, describe, expect, it, vi } from 'vitest';
import { WallpapersController } from '../src/wallpapers/wallpapers.controller';

const job = { id: '6f67e62b-8a27-4d2b-a77f-e42c67538e45', workshopId: '123', activeWorkshopId: '123', status: 'downloading', attempt: 1, errorCode: null, errorMessage: null, createdAt: new Date('2026-01-01T00:00:00Z'), startedAt: null, finishedAt: null };

describe('download progress API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges live worker progress into active jobs', async () => {
    const progress = { jobId: job.id, downloadedBytes: '50', totalBytes: '100', networkBytes: '25', bytesPerSecond: '1000', percent: 50, updatedAt: '2026-01-01T00:00:01.000Z' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([progress]), { status: 200 })));
    const db = { downloadJob: { findMany: vi.fn().mockResolvedValue([job]), count: vi.fn().mockResolvedValue(1) } };
    const result = await new WallpapersController({ db } as any).jobs();
    expect(result.items[0].progress).toEqual({ downloadedBytes: '50', totalBytes: '100', networkBytes: '25', bytesPerSecond: '1000', percent: 50, updatedAt: '2026-01-01T00:00:01.000Z' });
    expect(result.items[0].activeWorkshopId).toBeUndefined();
  });
});
