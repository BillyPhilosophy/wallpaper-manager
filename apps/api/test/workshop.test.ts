import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkshopController } from '../src/workshop/workshop.controller';

describe('Steam subscription synchronization', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('imports subscriptions without enqueueing downloads', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { publishedfileids: [{ publishedfileid: '123' }] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { publishedfiledetails: [{ publishedfileid: '123', title: 'Subscribed image', tags: [{ tag: 'Image' }, { tag: 'PG13' }] }] } }))));
    const db = {
      steamAuthState: { findUnique: vi.fn().mockResolvedValue({ steamId: '76561197960265851' }) },
      wallpaper: { upsert: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const controller = new WorkshopController({ db } as any);
    expect((await controller.syncSubscriptions()).status).toBe('running');
    await vi.waitFor(() => expect(controller.syncStatus().status).toBe('succeeded'));
    expect(db.wallpaper.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { workshopId: '123' }, create: expect.objectContaining({ type: 'image', contentRating: 'pg13', subscribed: true }) }));
    expect(controller.syncStatus().total).toBe(1);
  });

  it('accepts and saves a known SteamID64 without requiring Steam login', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { publishedfileids: [] } }))));
    const db = {
      steamAuthState: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
      wallpaper: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const controller = new WorkshopController({ db } as any);
    expect((await controller.syncSubscriptions({ steamId: '76561197960265851' })).status).toBe('running');
    expect(db.steamAuthState.upsert).toHaveBeenCalledWith({ where: { id: 1 }, update: { steamId: '76561197960265851' }, create: { id: 1, steamId: '76561197960265851' } });
    await vi.waitFor(() => expect(controller.syncStatus().status).toBe('succeeded'));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('steamid=76561197960265851');
  });

  it('rejects an invalid SteamID64 before contacting Steam', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new WorkshopController({ db: {} } as any);
    await expect(controller.syncSubscriptions({ steamId: 'invalid' })).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
