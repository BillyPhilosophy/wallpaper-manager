import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { SteamNetworkController } from '@wallpaper-manager/steam-network';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma, PrismaClient } from '@wallpaper-manager/database';
import { sanitizeError, WallpaperFileError } from '@wallpaper-manager/wallpaper-files';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR'; let message = '服务器内部错误';
    if (exception instanceof HttpException) {
      status = exception.getStatus(); const body = exception.getResponse();
      code = typeof body === 'object' && body && 'code' in body ? String(body.code) : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 429 ? 'STEAM_RATE_LIMITED' : 'BAD_REQUEST';
      message = typeof body === 'object' && body && 'message' in body ? String(body.message) : exception.message;
    } else if (exception instanceof WallpaperFileError) {
      status = exception.code === 'NOT_FOUND' ? 404 : exception.code === 'PATH_UNSAFE' ? 400 : 409; code = exception.code; message = exception.message;
    } else { const safe = sanitizeError(exception); code = safe.code; message = safe.message; }
    const route = request.route?.path || request.path;
    const entry = `requestId=${requestId} method=${request.method} route=${route} status=${status} code=${code}`;
    if (status >= 500) this.logger.error(`${entry} exception=${exception instanceof Error ? exception.name : 'Unknown'}`); else this.logger.warn(entry);
    response.status(status).json({ code, message: String(message).slice(0, 500), requestId });
  }
}
export function serializeWallpaper(item: any) { return { ...item, metadataJson: JSON.parse(item.metadataJson || '{}'), fileSizeBytes: item.fileSizeBytes?.toString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), downloadedAt: item.downloadedAt?.toISOString() ?? null }; }
export function serializeJob(item: any) { const { activeWorkshopId: _internal, ...job } = item; return { ...job, createdAt: item.createdAt.toISOString(), startedAt: item.startedAt?.toISOString() ?? null, finishedAt: item.finishedAt?.toISOString() ?? null }; }

@Injectable()
export class Infrastructure implements OnModuleDestroy {
  readonly db: PrismaClient = prisma;
  readonly steamNetwork = new SteamNetworkController();
  readonly redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null, lazyConnect: true });
  readonly downloads = new Queue('wallpaper-downloads', { connection: this.redis });
  readonly deletions = new Queue('wallpaper-deletions', { connection: this.redis });
  async onModuleDestroy() { await Promise.allSettled([this.downloads.close(), this.deletions.close(), this.redis.quit(), this.db.$disconnect()]); }
}
@Module({ providers: [Infrastructure], exports: [Infrastructure] })
export class InfrastructureModule {}
