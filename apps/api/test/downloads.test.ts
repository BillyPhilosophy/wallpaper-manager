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

  it('deletes one failed job without touching wallpaper files or active jobs', async () => {
    const downloadJob = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const result = await new WallpapersController({ db: { downloadJob } } as any).removeJob(job.id);
    expect(result).toEqual({ deleted: 1 });
    expect(downloadJob.deleteMany).toHaveBeenCalledWith({ where: { id: job.id, status: { in: ['failed', 'cancelled'] } } });
  });

  it('rejects deleting an active or retried job', async () => {
    const downloadJob = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn().mockResolvedValue(job) };
    await expect(new WallpapersController({ db: { downloadJob } } as any).removeJob(job.id)).rejects.toMatchObject({ status: 409 });
    expect(downloadJob.deleteMany).toHaveBeenCalledWith({ where: { id: job.id, status: { in: ['failed', 'cancelled'] } } });
  });

  it('clears only failed job history', async () => {
    const downloadJob = { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) };
    const result = await new WallpapersController({ db: { downloadJob } } as any).clearFailedJobs();
    expect(result).toEqual({ deleted: 3 });
    expect(downloadJob.deleteMany).toHaveBeenCalledWith({ where: { status: 'failed' } });
  });

  it('marks a database job as failed when Redis enqueueing fails', async () => {
    const created = { ...job, status: 'queued' };
    const downloadJob = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(created), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const wallpaper = { upsert: vi.fn().mockResolvedValue({ status: 'not_downloaded' }), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const db = { $transaction: vi.fn((callback) => callback({ downloadJob, wallpaper })) };
    const downloads = { count: vi.fn().mockResolvedValue(0), add: vi.fn().mockRejectedValue(new Error('offline')) };
    const controller = new WallpapersController({ db, downloads } as any);
    await expect(controller.download('123')).rejects.toMatchObject({ response: { code: 'QUEUE_UNAVAILABLE' } });
    expect(downloadJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: created.id, status: 'queued' }, data: expect.objectContaining({ status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' }) }));
  });
});
