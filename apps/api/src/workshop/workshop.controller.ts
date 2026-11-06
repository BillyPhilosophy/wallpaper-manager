import { ConflictException, Controller, Get, HttpException, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { assertWorkshopId, contentRating } from '@wallpaper-manager/wallpaper-files';
import type { ContentRating, WallpaperType, WorkshopItem } from '@wallpaper-manager/contracts';
import { Infrastructure } from '../common';

const cache = new Map<string, { expires: number; value: unknown }>();
const recentRequests: number[] = [];
let subscriptionSync: { status: 'idle' | 'running' | 'succeeded' | 'failed'; total: number; synced: number; message: string | null; updatedAt: string } = { status: 'idle', total: 0, synced: 0, message: null, updatedAt: new Date().toISOString() };
function inferType(detail: any): WallpaperType {
  const tags = (detail.tags || []).map((tag: any) => String(tag.tag || tag).toLowerCase());
  if (tags.includes('application')) return 'application'; if (tags.includes('video')) return 'video'; if (tags.includes('web')) return 'web'; if (tags.includes('scene')) return 'scene'; if (tags.includes('image')) return 'image'; return 'unknown';
}
function inferRating(detail: any): ContentRating {
  const tags = (detail.tags || []).map((tag: any) => String(tag.tag || tag));
  const match = tags.find((tag: string) => ['g', 'everyone', 'pg13', 'r', 'mature'].includes(tag.toLowerCase()));
  return contentRating(match);
}
function item(detail: any, local?: { status: string; type: string; contentRating: string; subscribed: boolean }): WorkshopItem {
  return { workshopId: String(detail.publishedfileid), title: detail.title || `工坊壁纸 ${detail.publishedfileid}`, description: detail.description || detail.short_description || null, type: (local?.status === 'downloaded' ? local.type : inferType(detail)) as WallpaperType, contentRating: (local?.status === 'downloaded' ? local.contentRating : inferRating(detail)) as ContentRating, subscribed: local?.subscribed || false, officialPreviewUrl: detail.preview_url || null, previewContentType: detail.preview_url ? (/\.mp4(\?|$)/.test(detail.preview_url) ? 'video/mp4' : null) : null, metadataJson: detail, localStatus: (local?.status || 'not_downloaded') as WorkshopItem['localStatus'] };
}
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key); if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load(); cache.set(key, { value, expires: Date.now() + 60_000 }); if (cache.size > 200) cache.delete(cache.keys().next().value!); return value;
}
async function steamFetch(url: string, init: RequestInit = {}): Promise<any> {
  while (recentRequests.length && recentRequests[0] <= Date.now() - 1000) recentRequests.shift();
  if (recentRequests.length >= 4) throw new HttpException({ code: 'STEAM_RATE_LIMITED', message: '搜索请求过于频繁' }, 429);
  recentRequests.push(Date.now());
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WallpaperManager/1.0', ...init.headers } }); }
  catch { throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: '无法连接 Steam 官方接口' }); }
  if (response.status === 429) throw new HttpException({ code: 'STEAM_RATE_LIMITED', message: 'Steam 请求限流，请稍后重试' }, 429);
  if (!response.ok) throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: 'Steam 官方接口暂不可用' });
  try { return await response.json(); } catch { throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: 'Steam 官方接口返回了无效响应' }); }
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
    const local = await this.infra.db.wallpaper.findMany({ where: { workshopId: { in: ids } } }); const states = new Map(local.map((entry) => [entry.workshopId, entry]));
    const items = details.map((entry: any) => item(entry, states.get(String(entry.publishedfileid))));
    await Promise.all(items.map((entry: WorkshopItem) => this.infra.db.wallpaper.updateMany({ where: { workshopId: entry.workshopId }, data: { title: entry.title, description: entry.description, officialPreviewUrl: entry.officialPreviewUrl, metadataJson: JSON.stringify(entry.metadataJson) } })));
    return { items, cursor: body.response?.next_cursor || null, total: Number(body.response?.total || items.length) };
  }
  @Get('items/:workshopId')
  async detail(@Param('workshopId') id: string) {
    assertWorkshopId(id);
    const body = await cached(`detail:${id}`, () => steamFetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': id }) }));
    const detail = body.response?.publishedfiledetails?.[0];
    if (!detail || detail.result !== 1 && !detail.publishedfileid) throw new ServiceUnavailableException({ code: 'WORKSHOP_ITEM_NOT_FOUND', message: '未找到工坊项目' });
    const local = await this.infra.db.wallpaper.findUnique({ where: { workshopId: id } });
    const result = item(detail, local || undefined);
    await this.infra.db.wallpaper.upsert({ where: { workshopId: id }, update: { title: result.title, description: result.description, type: result.type, contentRating: result.contentRating, officialPreviewUrl: result.officialPreviewUrl, metadataJson: JSON.stringify(result.metadataJson) }, create: { workshopId: id, title: result.title, description: result.description, type: result.type, contentRating: result.contentRating, officialPreviewUrl: result.officialPreviewUrl, metadataJson: JSON.stringify(result.metadataJson) } });
    return result;
  }
  @Get('subscriptions/sync')
  syncStatus() { return subscriptionSync; }
  @Post('subscriptions/sync')
  async syncSubscriptions() {
    if (subscriptionSync.status === 'running') return subscriptionSync;
    const key = process.env.STEAM_WEB_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: '未配置 Steam Web API Key' });
    const auth = await this.infra.db.steamAuthState.findUnique({ where: { id: 1 } });
    if (!auth?.steamId) throw new ConflictException({ code: 'STEAM_AUTH_REQUIRED', message: '需要先完成 Steam 登录以获取 SteamID' });
    subscriptionSync = { status: 'running', total: 0, synced: 0, message: null, updatedAt: new Date().toISOString() };
    console.log('[subscriptions] sync started');
    void this.performSubscriptionSync(key, auth.steamId).catch(() => { console.error('[subscriptions] sync failed'); subscriptionSync = { ...subscriptionSync, status: 'failed', message: 'Steam 订阅同步失败，请稍后重试', updatedAt: new Date().toISOString() }; });
    return subscriptionSync;
  }
  private async performSubscriptionSync(key: string, steamId: string) {
    const params = new URLSearchParams({ key, steamid: steamId, appid: '431960' });
    const body = await steamFetch(`https://api.steampowered.com/ISteamRemoteStorage/EnumerateUserSubscribedFiles/v1/?${params}`);
    const ids: string[] = (body.response?.publishedfileids || []).map((entry: any) => String(entry.publishedfileid || entry));
    subscriptionSync = { ...subscriptionSync, total: ids.length, updatedAt: new Date().toISOString() };
    console.log(`[subscriptions] received total=${ids.length}`);
    for (let offset = 0; offset < ids.length; offset += 100) {
      if (offset) await new Promise((resolve) => setTimeout(resolve, 300));
      const batch = ids.slice(offset, offset + 100);
      const params = new URLSearchParams({ itemcount: String(batch.length) });
      batch.forEach((id, index) => params.set(`publishedfileids[${index}]`, id));
      const detailsBody = await steamFetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
      const details = detailsBody.response?.publishedfiledetails || [];
      for (const detail of details) {
        if (!detail.publishedfileid) continue;
        const result = item(detail);
        await this.infra.db.wallpaper.upsert({ where: { workshopId: result.workshopId }, update: { title: result.title, description: result.description, subscribed: true, officialPreviewUrl: result.officialPreviewUrl, metadataJson: JSON.stringify(result.metadataJson) }, create: { workshopId: result.workshopId, title: result.title, description: result.description, type: result.type, contentRating: result.contentRating, subscribed: true, officialPreviewUrl: result.officialPreviewUrl, metadataJson: JSON.stringify(result.metadataJson) } });
      }
      subscriptionSync = { ...subscriptionSync, synced: Math.min(offset + batch.length, ids.length), updatedAt: new Date().toISOString() };
    }
    await this.infra.db.wallpaper.updateMany({ where: { subscribed: true, workshopId: { notIn: ids } }, data: { subscribed: false } });
    subscriptionSync = { ...subscriptionSync, status: 'succeeded', message: null, updatedAt: new Date().toISOString() };
    console.log(`[subscriptions] sync succeeded total=${ids.length}`);
  }
}
