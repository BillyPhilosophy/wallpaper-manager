import { PrismaClient } from '@prisma/client';
export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

export const prisma = new PrismaClient();
export const activeDownloadStatuses = ['queued', 'downloading', 'verifying', 'publishing'];

export async function recoverInterruptedJobs(client: PrismaClient = prisma): Promise<number> {
  return client.$transaction(async (tx) => {
    const active = await tx.downloadJob.findMany({ where: { status: { in: activeDownloadStatuses } } });
    for (const job of active) {
      const changed = await tx.downloadJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: 'failed', activeWorkshopId: null, errorCode: 'INTERNAL_ERROR', errorMessage: 'Worker 重启，任务可重试', finishedAt: new Date() } });
      if (changed.count) await tx.wallpaper.updateMany({ where: { workshopId: job.workshopId, status: job.status }, data: { status: 'not_downloaded', lastErrorCode: 'INTERNAL_ERROR', lastErrorMessage: '任务已中断，可重试' } });
    }
    return active.length;
  });
}
