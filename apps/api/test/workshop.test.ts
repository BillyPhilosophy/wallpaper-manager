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
});
