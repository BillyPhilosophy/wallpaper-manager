import { BadRequestException, ConflictException, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, Post, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { ACTIVE_DOWNLOAD_STATUSES, CONTENT_RATINGS, WALLPAPER_STATUSES, WALLPAPER_TYPES } from '@wallpaper-manager/contracts';
import { assertWorkshopId, previewDescriptor, resolveResourcePath, safeJobId, wallpaperDirectory } from '@wallpaper-manager/wallpaper-files';
import { Infrastructure, serializeJob, serializeWallpaper } from '../common';

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.pkg': 'application/octet-stream', '.tex': 'application/octet-stream', '.wasm': 'application/wasm' };

@Controller()
export class WallpapersController {
  constructor(private readonly infra: Infrastructure) {}
  @Get('wallpapers')
  async list(@Query('q') q = '', @Query('type') type = '', @Query('rating') rating = '', @Query('status') status = '', @Query('page') pageValue = '1', @Query('pageSize') sizeValue = '24') {
    const page = positive(pageValue, 1); const pageSize = Math.min(positive(sizeValue, 24), 100);
    const types = filterValues(type, WALLPAPER_TYPES, '无效类型'); const ratings = filterValues(rating, CONTENT_RATINGS, '无效内容分级');
    if (status && !WALLPAPER_STATUSES.includes(status as any)) throw new BadRequestException('无效状态');
    const where = { ...(q ? { OR: [{ title: { contains: q.slice(0, 100) } }, { workshopId: { contains: q.slice(0, 100) } }] } : {}), ...(type ? { type: { in: types } } : {}), ...(rating ? { contentRating: { in: ratings } } : {}), ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([this.infra.db.wallpaper.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), this.infra.db.wallpaper.count({ where })]);
    return { items: items.map(serializeWallpaper), page, pageSize, total };
  }
  @Get('wallpapers/:workshopId')
  async get(@Param('workshopId') id: string) { return serializeWallpaper(await this.find(id)); }
  @Post('wallpapers/:workshopId/download')
  async download(@Param('workshopId') id: string) {
    assertWorkshopId(id);
    const queued = await this.infra.downloads.count();
    if (queued >= Number(process.env.MAX_QUEUE_LENGTH || 20)) throw new ServiceUnavailableException({ code: 'CONFLICT', message: '下载队列已满' });
    const job = await this.infra.db.$transaction(async (tx) => {
      const wallpaper = await tx.wallpaper.upsert({ where: { workshopId: id }, update: {}, create: { workshopId: id, title: `工坊壁纸 ${id}` } });
      const active = await tx.downloadJob.findFirst({ where: { workshopId: id, status: { in: [...ACTIVE_DOWNLOAD_STATUSES] } } });
      if (active) return active;
      if (wallpaper.status === 'downloaded' || wallpaper.status === 'deleting') return null;
      const created = await tx.downloadJob.create({ data: { id: randomUUID(), workshopId: id, activeWorkshopId: id } });
      await tx.wallpaper.update({ where: { workshopId: id }, data: { status: 'queued', lastErrorCode: null, lastErrorMessage: null } });
      return created;
    });
    if (!job) return { job: null, wallpaper: serializeWallpaper(await this.find(id)) };
    if (job.status === 'queued') await this.infra.downloads.add('download', { jobId: job.id, workshopId: id }, { jobId: job.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    return { job: serializeJob(job) };
  }
  @Get('downloads')
  async jobs(@Query('status') status = '', @Query('page') value = '1', @Query('pageSize') sizeValue = '20') {
    const page = positive(value, 1); const pageSize = Math.min(positive(sizeValue, 20), 100); const where = status ? { status } : {};
    const [items, total] = await Promise.all([this.infra.db.downloadJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), this.infra.db.downloadJob.count({ where })]);
    return { items: items.map(serializeJob), page, pageSize, total };
  }
  @Get('downloads/:jobId')
  async job(@Param('jobId') id: string) { safeJobId(id); const job = await this.infra.db.downloadJob.findUnique({ where: { id } }); if (!job) throw new NotFoundException('任务不存在'); return serializeJob(job); }
  @Post('downloads/:jobId/cancel') @HttpCode(200)
  async cancel(@Param('jobId') id: string) {
    safeJobId(id); const job = await this.infra.db.downloadJob.findUnique({ where: { id } }); if (!job) throw new NotFoundException('任务不存在');
    if (!ACTIVE_DOWNLOAD_STATUSES.includes(job.status as any)) return serializeJob(job);
    await this.infra.redis.set(`wallpaper:cancel:${id}`, '1', 'EX', 3600);
    const changed = await this.infra.db.downloadJob.updateMany({ where: { id, status: { in: [...ACTIVE_DOWNLOAD_STATUSES] } }, data: { status: 'cancelled', activeWorkshopId: null, errorCode: 'CANCELLED', errorMessage: '用户已取消', finishedAt: new Date() } });
    if (changed.count) await this.infra.db.wallpaper.updateMany({ where: { workshopId: job.workshopId, status: { in: ['queued', 'downloading', 'verifying', 'publishing'] } }, data: { status: 'not_downloaded' } });
    const queued = await this.infra.downloads.getJob(id); if (queued) await queued.remove().catch(() => undefined);
    return serializeJob(await this.infra.db.downloadJob.findUnique({ where: { id } }));
  }
  @Post('downloads/:jobId/retry')
  async retry(@Param('jobId') id: string) {
    safeJobId(id); const old = await this.infra.db.downloadJob.findUnique({ where: { id } }); if (!old) throw new NotFoundException('任务不存在');
    if (!['failed', 'cancelled'].includes(old.status)) throw new ConflictException('仅失败或已取消任务可重试');
    const active = await this.infra.db.downloadJob.findFirst({ where: { workshopId: old.workshopId, status: { in: [...ACTIVE_DOWNLOAD_STATUSES] } } }); if (active) return { job: serializeJob(active) };
    const job = await this.infra.db.downloadJob.create({ data: { id: randomUUID(), workshopId: old.workshopId, activeWorkshopId: old.workshopId, attempt: old.attempt + 1 } });
    await this.infra.db.wallpaper.update({ where: { workshopId: old.workshopId }, data: { status: 'queued', lastErrorCode: null, lastErrorMessage: null } });
    await this.infra.downloads.add('download', { jobId: job.id, workshopId: old.workshopId }, { jobId: job.id });
    return { job: serializeJob(job) };
  }
  @Delete('wallpapers/:workshopId')
  async remove(@Param('workshopId') id: string) {
    assertWorkshopId(id); const wallpaper = await this.find(id);
    if (wallpaper.status !== 'downloaded') throw new ConflictException('仅已下载壁纸可删除');
    const active = await this.infra.db.downloadJob.findFirst({ where: { workshopId: id, status: { in: [...ACTIVE_DOWNLOAD_STATUSES] } } }); if (active) throw new ConflictException('存在活跃任务');
    const changed = await this.infra.db.wallpaper.updateMany({ where: { workshopId: id, status: 'downloaded' }, data: { status: 'deleting' } }); if (!changed.count) throw new ConflictException('壁纸状态已变化');
    const deleteJobId = randomUUID(); await this.infra.deletions.add('delete', { deleteJobId, workshopId: id }, { jobId: deleteJobId });
    return { deleteJobId };
  }
  @Get('wallpapers/:workshopId/preview-descriptor')
  async preview(@Param('workshopId') id: string) {
    const wallpaper = await this.find(id); let entry: string | null = null;
    if (wallpaper.status === 'downloaded') {
      const project = JSON.parse(wallpaper.metadataJson || '{}'); entry = typeof project.__entry === 'string' ? project.__entry : null;
      if (!entry) { try { const { inspectWallpaper } = await import('@wallpaper-manager/wallpaper-files'); entry = (await inspectWallpaper(wallpaperDirectory(process.env.STEAM_ROOT || './steam-data', id))).entry; } catch { entry = null; } }
    }
    return previewDescriptor(id, wallpaper.type as any, entry, wallpaper.officialPreviewUrl, wallpaper.status === 'downloaded');
  }
  @Get('wallpapers/:workshopId/resources/{*resourcePath}')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', 'sandbox allow-scripts')
  async resource(@Param('workshopId') id: string, @Req() request: Request, @Res() response: Response) {
    const raw = request.params.resourcePath; const relative = Array.isArray(raw) ? raw.join('/') : raw;
    const file = await resolveResourcePath(process.env.STEAM_ROOT || './steam-data', id, relative);
    const stat = await fs.stat(file); const type = mime[path.extname(file).toLowerCase()] || 'application/octet-stream';
    response.setHeader('Content-Type', type); response.setHeader('Accept-Ranges', 'bytes'); response.setHeader('Cache-Control', 'private, max-age=60');
    const range = request.headers.range; let start = 0; let end = stat.size - 1; let status = 200;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range); if (!match) { response.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end(); return; }
      if (!match[1] && match[2]) start = Math.max(0, stat.size - Number(match[2])); else start = Number(match[1]);
      if (match[2] && match[1]) end = Math.min(Number(match[2]), end);
      if (!Number.isSafeInteger(start) || start > end || start >= stat.size) { response.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end(); return; }
      status = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    }
    response.status(status).setHeader('Content-Length', end - start + 1);
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file, { start, end }); stream.on('error', () => response.destroy()); stream.pipe(response);
  }
  private async find(id: string) { assertWorkshopId(id); const item = await this.infra.db.wallpaper.findUnique({ where: { workshopId: id } }); if (!item) throw new NotFoundException('壁纸不存在'); return item; }
}
function positive(value: string, fallback: number): number { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; }
function filterValues(value: string, allowed: readonly string[], message: string): string[] {
  const values = value ? value.split(',').filter(Boolean) : [];
  if (values.some((entry) => !allowed.includes(entry))) throw new BadRequestException(message);
  return values;
}
