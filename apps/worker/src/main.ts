import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { parseWorkerEnv } from '@wallpaper-manager/config';
import { prisma, recoverInterruptedJobs } from '@wallpaper-manager/database';
import { DownloadProcessor, deleteWallpaper, refreshDownloadedClassifications } from './processor';
import { SteamCmdClient } from './steamcmd';
import { startAuthServer } from './auth-server';

async function main() {
  const env = parseWorkerEnv(); await recoverInterruptedJobs(prisma); await refreshDownloadedClassifications(env.STEAM_ROOT);
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const steam = new SteamCmdClient(env.STEAMCMD_BIN, env.STEAM_CONFIG_DIR, env.DOWNLOAD_TIMEOUT_MS);
  const server = startAuthServer(steam); const processor = new DownloadProcessor(steam, connection, env.STAGING_DIR, env.STEAM_ROOT);
  const downloads = new Worker('wallpaper-downloads', (job) => processor.process(job as any), { connection, concurrency: env.DOWNLOAD_CONCURRENCY });
  const deletions = new Worker('wallpaper-deletions', (job) => deleteWallpaper(job.data, env.STEAM_ROOT, env.TRASH_DIR), { connection, concurrency: 1 });
  const shutdown = async () => { await Promise.allSettled([downloads.close(), deletions.close()]); server.close(); await steam.close(); await connection.quit(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGTERM', () => void shutdown()); process.on('SIGINT', () => void shutdown());
  console.log('Wallpaper Manager worker ready');
}
void main().catch(() => { console.error('Worker 启动失败'); process.exit(1); });
