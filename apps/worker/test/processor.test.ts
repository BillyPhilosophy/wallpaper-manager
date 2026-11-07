import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stagingWorkshopDirectory } from '@wallpaper-manager/wallpaper-files';
import { DownloadProcessor, sanitizeWorkerError } from '../src/processor';
import type { SteamClient } from '../src/steam';

describe('worker errors', () => {
  it('classifies without leaking input', () => {
    expect(sanitizeWorkerError(new Error('STEAM_AUTH_REQUIRED')).code).toBe('STEAM_AUTH_REQUIRED');
    expect(sanitizeWorkerError(new Error('password=secret'))).toEqual({ code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' });
  });
});

describe('DepotDownloader processing', () => {
  it('verifies and publishes the direct download directory without an in-memory auth gate', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-processor-'));
    const stagingDir = path.join(root, 'staging');
    const steamRoot = path.join(root, 'steam-data');
    const jobId = crypto.randomUUID();
    let downloadTarget = '';
    const steam: SteamClient = {
      status: 'auth_required', steamId: null, accountName: 'test',
      initialize: vi.fn(), login: vi.fn(), guard: vi.fn(), logout: vi.fn(), close: vi.fn(),
      download: vi.fn(async (target: string, _workshopId: string, _cancel: () => Promise<boolean>, onProgress?: (progress: any) => void) => {
        downloadTarget = target;
        onProgress?.({ downloadedBytes: '8', totalBytes: '8', networkBytes: '8', bytesPerSecond: '4', percent: 100, updatedAt: new Date().toISOString() });
        await mkdir(target, { recursive: true });
        await writeFile(path.join(target, 'project.json'), JSON.stringify({ title: 'Scene', type: 'scene', file: 'scene.pkg' }));
        await writeFile(path.join(target, 'scene.pkg'), 'fixture');
      }),
    };
    const downloadJob = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const wallpaper = { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue({ downloadedAt: null }) };
    const db = { downloadJob, wallpaper, $transaction: vi.fn((callback) => callback({ downloadJob, wallpaper })) };
    const redis = { exists: vi.fn().mockResolvedValue(0) };
    const processor = new DownloadProcessor(steam, redis as any, stagingDir, steamRoot, db as any);
    try {
      await processor.process({ data: { jobId, workshopId: '123' } } as any);
      expect(processor.getProgress()).toEqual([]);
      expect(downloadTarget).toBe(stagingWorkshopDirectory(stagingDir, jobId, '123'));
      const published = path.join(steamRoot, 'steamapps', 'workshop', 'content', '431960', '123');
      expect(JSON.parse(await readFile(path.join(published, 'project.json'), 'utf8')).title).toBe('Scene');
      expect((await stat(path.join(published, 'scene.pkg'))).isFile()).toBe(true);
      expect(downloadJob.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'succeeded' }) }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
