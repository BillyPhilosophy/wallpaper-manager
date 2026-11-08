import { BadRequestException, Body, ConflictException, Controller, Get, HttpException, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { assertWorkshopId, contentRating } from '@wallpaper-manager/wallpaper-files';
import type { ContentRating, WallpaperType, WorkshopItem } from '@wallpaper-manager/contracts';
import type { SteamNetworkController } from '@wallpaper-manager/steam-network';
import { filterValues, Infrastructure } from '../common';

const SEARCH_TYPE_TAGS = { scene: 'Scene', web: 'Web', video: 'Video', image: 'Image', application: 'Application' } as const;
const SEARCH_RATING_TAGS = { everyone: 'Everyone', pg13: 'PG13', mature: 'Mature' } as const;
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
async function steamFetch(network: SteamNetworkController | undefined, url: string, init: RequestInit = {}): Promise<any> {
  while (recentRequests.length && recentRequests[0] <= Date.now() - 1000) recentRequests.shift();
  if (recentRequests.length >= 4) throw new HttpException({ code: 'STEAM_RATE_LIMITED', message: '搜索请求过于频繁' }, 429);
  recentRequests.push(Date.now());
  let response: Response;
  try { response = network ? await network.fetchSteam(url, { ...init, headers: { 'User-Agent': 'WallpaperManager/1.0', ...init.headers } }) : await fetch(url, { ...init, signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WallpaperManager/1.0', ...init.headers } }); }
  catch { console.warn('[steam-api] network request failed or timed out'); throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: '无法连接 Steam 官方接口' }); }
  if (response.status === 429) { console.warn('[steam-api] upstream status=429'); throw new HttpException({ code: 'STEAM_RATE_LIMITED', message: 'Steam 请求限流，请稍后重试' }, 429); }
  if (!response.ok) { console.warn(`[steam-api] upstream status=${response.status}`); throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: 'Steam 官方接口暂不可用' }); }
  try { return await response.json(); } catch { console.warn('[steam-api] upstream returned invalid JSON'); throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: 'Steam 官方接口返回了无效响应' }); }
}
@Controller('workshop')
export class WorkshopController {
  constructor(private readonly infra: Infrastructure) {}
  @Get('search')
  async search(@Query('q') q = '', @Query('cursor') cursor = '*', @Query('pageSize') size = '20', @Query('type') type = '', @Query('rating') rating = '') {
    const pageSize = Math.min(Math.max(Number(size) || 20, 1), 50); const key = process.env.STEAM_WEB_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: '未配置 Steam Web API Key' });
    const types = filterValues(type, Object.keys(SEARCH_TYPE_TAGS), '无效类型').map((value) => SEARCH_TYPE_TAGS[value as keyof typeof SEARCH_TYPE_TAGS]);
    const ratings = filterValues(rating, Object.keys(SEARCH_RATING_TAGS), '无效内容分级').map((value) => SEARCH_RATING_TAGS[value as keyof typeof SEARCH_RATING_TAGS]);
    const params = new URLSearchParams({ key, appid: '431960', query_type: '0', page: '1', numperpage: String(pageSize), cursor: cursor || '*', return_metadata: 'true', return_short_description: 'true', return_tags: 'true', search_text: q.slice(0, 200) });
    [types, ratings].filter((tags) => tags.length).forEach((tags, group) => tags.forEach((tag, index) => params.set(`taggroups[${group}][tags][${index}]`, tag)));
    const body = await cached(`search:${params}`, () => steamFetch(this.infra.steamNetwork, `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params}`));
    const details = body.response?.publishedfiledetails || []; const ids = details.map((entry: any) => String(entry.publishedfileid));
    const local = await this.infra.db.wallpaper.findMany({ where: { workshopId: { in: ids } } }); const states = new Map(local.map((entry) => [entry.workshopId, entry]));
    const items = details.map((entry: any) => item(entry, states.get(String(entry.publishedfileid))));
    await Promise.all(items.map((entry: WorkshopItem) => this.infra.db.wallpaper.updateMany({ where: { workshopId: entry.workshopId }, data: { title: entry.title, description: entry.description, officialPreviewUrl: entry.officialPreviewUrl, metadataJson: JSON.stringify(entry.metadataJson) } })));
    return { items, cursor: body.response?.next_cursor || null, total: Number(body.response?.total || items.length) };
  }
  @Get('items/:workshopId')
  async detail(@Param('workshopId') id: string) {
    assertWorkshopId(id);
    const body = await cached(`detail:${id}`, () => steamFetch(this.infra.steamNetwork, 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': id }) }));
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
  async syncSubscriptions(@Body() body?: { steamId?: unknown }) {
    if (subscriptionSync.status === 'running') return subscriptionSync;
    const supplied = typeof body?.steamId === 'string' ? body.steamId.trim() : body?.steamId;
    if (supplied !== undefined && supplied !== '' && (typeof supplied !== 'string' || !/^7656119\d{10}$/.test(supplied))) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'SteamID64 格式无效' });
    const key = process.env.STEAM_WEB_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: 'STEAM_API_UNAVAILABLE', message: '未配置 Steam Web API Key' });
    const auth = await this.infra.db.steamAuthState.findUnique({ where: { id: 1 } });
    const requestedSteamId = typeof supplied === 'string' && supplied ? supplied : undefined;
    const steamId = requestedSteamId || auth?.steamId;
    if (!steamId) throw new ConflictException({ code: 'STEAM_ID_REQUIRED', message: '请填写 SteamID64 后同步' });
    if (requestedSteamId && requestedSteamId !== auth?.steamId) await this.infra.db.steamAuthState.upsert({ where: { id: 1 }, update: { steamId: requestedSteamId }, create: { id: 1, steamId: requestedSteamId } });
    subscriptionSync = { status: 'running', total: 0, synced: 0, message: null, updatedAt: new Date().toISOString() };
    console.log('[subscriptions] sync started');
    void this.performSubscriptionSync(key, steamId).catch(() => { console.error('[subscriptions] sync failed'); subscriptionSync = { ...subscriptionSync, status: 'failed', message: 'Steam 订阅同步失败，请稍后重试', updatedAt: new Date().toISOString() }; });
    return subscriptionSync;
  }
  private async performSubscriptionSync(key: string, steamId: string) {
    const params = new URLSearchParams({ key, steamid: steamId, appid: '431960' });
    const body = await steamFetch(this.infra.steamNetwork, `https://api.steampowered.com/ISteamRemoteStorage/EnumerateUserSubscribedFiles/v1/?${params}`);
    const ids: string[] = (body.response?.publishedfileids || []).map((entry: any) => String(entry.publishedfileid || entry));
    subscriptionSync = { ...subscriptionSync, total: ids.length, updatedAt: new Date().toISOString() };
    console.log(`[subscriptions] received total=${ids.length}`);
    for (let offset = 0; offset < ids.length; offset += 100) {
      if (offset) await new Promise((resolve) => setTimeout(resolve, 300));
      const batch = ids.slice(offset, offset + 100);
      const params = new URLSearchParams({ itemcount: String(batch.length) });
      batch.forEach((id, index) => params.set(`publishedfileids[${index}]`, id));
      const detailsBody = await steamFetch(this.infra.steamNetwork, 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
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
