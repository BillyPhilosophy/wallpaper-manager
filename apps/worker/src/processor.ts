import { promises as fs } from 'node:fs';
import path from 'node:path';
import IORedis from 'ioredis';
import type { Job } from 'bullmq';
import { prisma, PrismaClient } from '@wallpaper-manager/database';
import { directorySize, inspectWallpaper, moveToTrash, publishDirectory, sanitizeError, stagingWorkshopDirectory, wallpaperDirectory } from '@wallpaper-manager/wallpaper-files';
import type { SteamClient } from './steam';
import type { DownloadProgress } from '@wallpaper-manager/contracts';

export interface DownloadPayload { jobId: string; workshopId: string }
export class DownloadProcessor {
  private readonly progress = new Map<string, DownloadProgress>();
  constructor(private readonly steam: SteamClient, private readonly redis: IORedis, private readonly stagingDir: string, private readonly steamRoot: string, private readonly db: PrismaClient = prisma) {}
  getProgress(): (DownloadProgress & { jobId: string })[] { return [...this.progress].map(([jobId, progress]) => ({ jobId, ...progress })); }
  private cancelled(id: string) { return this.redis.exists(`wallpaper:cancel:${id}`).then(Boolean); }
  private async stage(id: string, workshopId: string, from: string[], to: string) {
    const changed = await this.db.downloadJob.updateMany({ where: { id, status: { in: from } }, data: { status: to, startedAt: to === 'downloading' ? new Date() : undefined } });
    if (changed.count) await this.db.wallpaper.updateMany({ where: { workshopId, status: { in: from } }, data: { status: to as any } });
    if (!changed.count && await this.cancelled(id)) throw new Error('CANCELLED');
  }
  async process(job: Job<DownloadPayload>): Promise<void> {
    const { jobId, workshopId } = job.data; const staging = path.join(this.stagingDir, jobId);
    try {
      if (await this.cancelled(jobId)) throw new Error('CANCELLED');
      await this.stage(jobId, workshopId, ['queued'], 'downloading');
      await fs.mkdir(staging, { recursive: true, mode: 0o755 });
      const source = stagingWorkshopDirectory(this.stagingDir, jobId, workshopId);
      await this.steam.download(source, workshopId, () => this.cancelled(jobId), (progress) => { this.progress.set(jobId, progress); });
      await this.stage(jobId, workshopId, ['downloading'], 'verifying');
      const info = await inspectWallpaper(source);
      if (info.type === 'application' || info.type === 'unknown') throw new Error('UNSUPPORTED_TYPE');
      const size = await directorySize(source); if (!size) throw new Error('RESOURCE_MISSING');
      await this.stage(jobId, workshopId, ['verifying'], 'publishing');
      const destination = await publishDirectory(source, this.steamRoot, workshopId);
      const changed = await this.db.$transaction(async (tx) => {
        const result = await tx.downloadJob.updateMany({ where: { id: jobId, status: 'publishing' }, data: { status: 'succeeded', activeWorkshopId: null, finishedAt: new Date(), errorCode: null, errorMessage: null } });
        if (result.count) await tx.wallpaper.update({ where: { workshopId }, data: { title: typeof info.project.title === 'string' ? info.project.title : undefined, type: info.type, contentRating: info.contentRating, metadataJson: JSON.stringify({ ...info.project, __entry: info.entry }), localRelativePath: workshopId, status: 'downloaded', fileSizeBytes: size, downloadedAt: (await tx.wallpaper.findUnique({ where: { workshopId } }))?.downloadedAt || new Date(), lastErrorCode: null, lastErrorMessage: null } });
        return result.count;
      });
      if (!changed) { const trash = path.join(this.stagingDir, '..', 'trash'); await moveToTrash(this.steamRoot, trash, workshopId).then((target) => fs.rm(target, { recursive: true, force: true })); throw new Error('CANCELLED'); }
      await fs.rm(staging, { recursive: true, force: true });
      this.progress.delete(jobId);
    } catch (error) {
      const safe = sanitizeWorkerError(error); const cancelled = safe.code === 'CANCELLED' || await this.cancelled(jobId); const status = cancelled ? 'cancelled' : 'failed';
      await this.db.downloadJob.updateMany({ where: { id: jobId, status: { notIn: ['succeeded', 'cancelled'] } }, data: { status, activeWorkshopId: null, errorCode: cancelled ? 'CANCELLED' : safe.code, errorMessage: cancelled ? '用户已取消' : safe.message, finishedAt: new Date() } });
      await this.db.wallpaper.updateMany({ where: { workshopId, status: { notIn: ['downloaded', 'deleting'] } }, data: { status: 'not_downloaded', localRelativePath: null, lastErrorCode: cancelled ? 'CANCELLED' : safe.code, lastErrorMessage: cancelled ? '用户已取消' : safe.message } });
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      this.progress.delete(jobId);
      if (cancelled) return; throw error;
    }
  }
}
export async function refreshDownloadedClassifications(steamRoot: string, db: PrismaClient = prisma): Promise<void> {
  const wallpapers = await db.wallpaper.findMany({ where: { status: 'downloaded' }, select: { workshopId: true } });
  for (const wallpaper of wallpapers) {
    try {
      const info = await inspectWallpaper(wallpaperDirectory(steamRoot, wallpaper.workshopId));
      await db.wallpaper.update({ where: { workshopId: wallpaper.workshopId }, data: { title: typeof info.project.title === 'string' ? info.project.title : undefined, type: info.type, contentRating: info.contentRating, metadataJson: JSON.stringify({ ...info.project, __entry: info.entry }) } });
    } catch { }
  }
}
export function sanitizeWorkerError(error: unknown): { code: string; message: string } {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const known: Record<string, string> = { STEAM_AUTH_REQUIRED: '需要先完成 Steam 登录', STEAM_GUARD_REQUIRED: '需要 Steam Guard 验证码', STEAM_BUSY: '另一个 Steam 操作正在进行', STEAM_RATE_LIMITED: 'Steam 下载限流，请稍后重试', STEAM_DOWNLOAD_FAILED: 'Steam 下载失败', DOWNLOAD_TIMEOUT: '下载超时', DISK_FULL: '磁盘空间不足', WORKSHOP_ITEM_NOT_FOUND: '工坊项目不存在或不可访问', UNSUPPORTED_TYPE: '不支持该壁纸类型', RESOURCE_MISSING: '壁纸关键资源缺失', CANCELLED: '用户已取消' };
  if (known[code]) return { code, message: known[code] };
  return sanitizeError(error);
}
export async function deleteWallpaper(data: { deleteJobId: string; workshopId: string }, steamRoot: string, trashDir: string): Promise<void> {
  const { deleteJobId, workshopId } = data;
  try {
    const target = await moveToTrash(steamRoot, trashDir, workshopId, deleteJobId);
    await prisma.wallpaper.updateMany({ where: { workshopId, status: 'deleting' }, data: { status: 'not_downloaded', localRelativePath: null, fileSizeBytes: null, downloadedAt: null } });
    await fs.rm(target, { recursive: true, force: true });
  } catch (error) {
    const trashed = path.join(trashDir, deleteJobId, workshopId);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && await exists(trashed)) {
      await prisma.wallpaper.updateMany({ where: { workshopId, status: 'deleting' }, data: { status: 'not_downloaded', localRelativePath: null, fileSizeBytes: null, downloadedAt: null } }); await fs.rm(trashed, { recursive: true, force: true }); return;
    }
    await prisma.wallpaper.updateMany({ where: { workshopId, status: 'deleting' }, data: { status: await exists(wallpaperDirectory(steamRoot, workshopId)) ? 'downloaded' : 'not_downloaded' } }); throw error;
  }
}
async function exists(value: string) { try { await fs.lstat(value); return true; } catch { return false; } }
