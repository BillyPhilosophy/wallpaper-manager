import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkshopController } from '../src/workshop/workshop.controller';

describe('Steam subscription synchronization', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('imports subscriptions without enqueueing downloads', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { total: 1, publishedfiledetails: [{ publishedfileid: '123' }] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { publishedfiledetails: [{ publishedfileid: '123', title: 'Subscribed image', tags: [{ tag: 'Image' }, { tag: 'PG13' }] }] } }))));
    const db = {
      steamAuthState: { findUnique: vi.fn().mockResolvedValue({ steamId: '76561197960265851' }) },
      wallpaper: { upsert: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const controller = new WorkshopController({ db } as any);
    expect((await controller.syncSubscriptions()).status).toBe('running');
    await vi.waitFor(() => expect(controller.syncStatus().status).toBe('succeeded'));
    expect(db.wallpaper.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { workshopId: '123' }, update: expect.objectContaining({ type: 'image', contentRating: 'pg13', subscribed: true }), create: expect.objectContaining({ type: 'image', contentRating: 'pg13', subscribed: true }) }));
    expect(controller.syncStatus().total).toBe(1);
  });

  it('accepts and saves a known SteamID64 without requiring Steam login', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { total: 0, publishedfiledetails: [] } }))));
    const db = {
      steamAuthState: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
      wallpaper: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const controller = new WorkshopController({ db } as any);
    expect((await controller.syncSubscriptions({ steamId: '76561197960265851' })).status).toBe('running');
    expect(db.steamAuthState.upsert).toHaveBeenCalledWith({ where: { id: 1 }, update: { steamId: '76561197960265851' }, create: { id: 1, steamId: '76561197960265851' } });
    await vi.waitFor(() => expect(controller.syncStatus().status).toBe('succeeded'));
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('/IPublishedFileService/GetUserFiles/v1/');
    expect(url).toContain('type=mysubscriptions');
    expect(url).toContain('steamid=76561197960265851');
  });

  it('rejects an invalid SteamID64 before contacting Steam', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new WorkshopController({ db: {} } as any);
    await expect(controller.syncSubscriptions({ steamId: 'invalid' })).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps search types, ratings, page and sorting to upstream parameters', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { total: 1, publishedfiledetails: [{ publishedfileid: '123', title: 'Filtered scene', tags: [{ tag: 'Scene' }, { tag: 'Everyone' }] }] } })));
    vi.stubGlobal('fetch', fetchMock);
    const db = { wallpaper: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, favorite: { findMany: vi.fn().mockResolvedValue([]) } };
    const result = await new WorkshopController({ db } as any).search('forest', '2', '20', 'scene,video', 'everyone,pg13', 'subscriptions');
    const params = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    expect(params.get('page')).toBe('2');
    expect(params.has('cursor')).toBe(false);
    expect(params.get('query_type')).toBe('9');
    expect(params.get('match_all_tags')).toBe('false');
    expect(params.get('requiredtags[0]')).toBe('Scene');
    expect(params.get('requiredtags[1]')).toBe('Video');
    // 分级走排除法：选了 everyone+pg13(Everyone+Questionable)，排除未选的 Mature；taggroups 已弃用
    expect(params.get('excludedtags[0]')).toBe('Mature');
    expect(params.has('taggroups[0][tags][0]')).toBe(false);
    expect(result.total).toBe(1);
    expect(result.cursor).toBeNull();
  });

  it('rejects filters that cannot be represented by upstream tags', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new WorkshopController({ db: {} } as any);
    await expect(controller.search('', '*', '20', 'unknown', '')).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns detail read-only without writing the wallpaper table', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { publishedfiledetails: [{ result: 1, publishedfileid: '123', title: 'Browsed scene', tags: [{ tag: 'Scene' }, { tag: 'Everyone' }] }] } }))));
    const db = {
      wallpaper: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), update: vi.fn(), create: vi.fn() },
      favorite: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const result = await new WorkshopController({ db } as any).detail('123');
    expect(db.wallpaper.upsert).not.toHaveBeenCalled();
    expect(db.wallpaper.update).not.toHaveBeenCalled();
    expect(db.wallpaper.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ workshopId: '123', localStatus: 'not_downloaded', favorited: false });
  });

  it('marks detail favorited when a favorite row exists', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { publishedfiledetails: [{ result: 1, publishedfileid: '456', title: 'Scene', tags: [{ tag: 'Scene' }] }] } }))));
    const db = {
      wallpaper: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      favorite: { findUnique: vi.fn().mockResolvedValue({ workshopId: '456' }) },
    };
    const result = await new WorkshopController({ db } as any).detail('456');
    expect(db.wallpaper.upsert).not.toHaveBeenCalled();
    expect(result.favorited).toBe(true);
  });
});
