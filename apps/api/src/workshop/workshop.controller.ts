import { Controller, Get, HttpException, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { assertWorkshopId } from '@wallpaper-manager/wallpaper-files';
import type { WallpaperType, WorkshopItem } from '@wallpaper-manager/contracts';
import { Infrastructure } from '../common';

const cache = new Map<string, { expires: number; value: unknown }>();
const recentRequests: number[] = [];
function inferType(detail: any): WallpaperType {
  const tags = (detail.tags || []).map((tag: any) => String(tag.tag || tag).toLowerCase());
  if (tags.includes('application')) return 'application'; if (tags.includes('video')) return 'video'; if (tags.includes('web')) return 'web'; if (tags.includes('scene')) return 'scene'; return 'unknown';
}
function item(detail: any, localStatus: any = 'not_downloaded'): WorkshopItem {
  return { workshopId: String(detail.publishedfileid), title: detail.title || `工坊壁纸 ${detail.publishedfileid}`, description: detail.description || detail.short_description || null, type: inferType(detail), officialPreviewUrl: detail.preview_url || null, previewContentType: detail.preview_url ? (/\.mp4(\?|$)/.test(detail.preview_url) ? 'video/mp4' : null) : null, metadataJson: detail, localStatus };
}
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key); if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load(); cache.set(key, { value, expires: Date.now() + 60_000 }); if (cache.size > 200) cache.delete(cache.keys().next().value!); return value;
}
async function steamFetch(url: string, init: RequestInit = {}): Promise<any> {
  while (recentRequests.length && recentRequests[0] <= Date.now() - 1000) recentRequests.shift();
  if (recentRequests.length >= 4) throw new HttpException({ code: 'STEAM_RATE_LIMITED', message: '搜索请求过于频繁' }, 429);
  recentRequests.push(Date.now());
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WallpaperManager/1.0', ...init.headers } });
  if (response.status === 429) throw new HttpException({ code: 'STEAM_RATE_LIMITED', message: 'Steam 请求限流，请稍后重试' }, 429);
  if (!response.ok) throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: 'Steam 官方接口暂不可用' });
  return response.json();
}
@Controller('workshop')
export class WorkshopController {
  constructor(private readonly infra: Infrastructure) {}
  @Get('search')
  async search(@Query('q') q = '', @Query('cursor') cursor = '*', @Query('pageSize') size = '20') {
    const pageSize = Math.min(Math.max(Number(size) || 20, 1), 50); const key = process.env.STEAM_WEB_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: '未配置 Steam Web API Key' });
    const params = new URLSearchParams({ key, appid: '431960', query_type: '0', page: '1', numperpage: String(pageSize), cursor: cursor || '*', return_metadata: 'true', return_short_description: 'true', return_tags: 'true', search_text: q.slice(0, 200) });
    const body = await cached(`search:${params}`, () => steamFetch(`https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params}`));
    const details = body.response?.publishedfiledetails || []; const ids = details.map((entry: any) => String(entry.publishedfileid));
    const local = await this.infra.db.wallpaper.findMany({ where: { workshopId: { in: ids } } }); const states = new Map(local.map((entry) => [entry.workshopId, entry.status]));
    const items = details.map((entry: any) => item(entry, states.get(String(entry.publishedfileid)) || 'not_downloaded'));
    await Promise.all(items.map((entry: WorkshopItem) => this.infra.db.wallpaper.updateMany({ where: { workshopId: entry.workshopId }, data: { title: entry.title, description: entry.description, type: entry.type, officialPreviewUrl: entry.officialPreviewUrl, metadataJson: JSON.stringify(entry.metadataJson) } })));
    return { items, cursor: body.response?.next_cursor || null, total: Number(body.response?.total || items.length) };
  }
  @Get('items/:workshopId')
  async detail(@Param('workshopId') id: string) {
    assertWorkshopId(id);
    const body = await cached(`detail:${id}`, () => steamFetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': id }) }));
    const detail = body.response?.publishedfiledetails?.[0];
    if (!detail || detail.result !== 1 && !detail.publishedfileid) throw new ServiceUnavailableException({ code: 'WORKSHOP_ITEM_NOT_FOUND', message: '未找到工坊项目' });
    const local = await this.infra.db.wallpaper.findUnique({ where: { workshopId: id } });
    const result = item(detail, local?.status || 'not_downloaded');
    await this.infra.db.wallpaper.upsert({ where: { workshopId: id }, update: { title: result.title, description: result.description, type: result.type, officialPreviewUrl: result.officialPreviewUrl, metadataJson: JSON.stringify(result.metadataJson) }, create: { workshopId: id, title: result.title, description: result.description, type: result.type, officialPreviewUrl: result.officialPreviewUrl, metadataJson: JSON.stringify(result.metadataJson) } });
    return result;
  }
}
