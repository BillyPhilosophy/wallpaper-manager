import { describe, expect, it, vi } from 'vitest';
import { FavoritesController } from '../src/favorites/favorites.controller';

describe('favorites controller', () => {
  it('lists favorites with q filter, pagination and ISO createdAt', async () => {
    const createdAt = new Date('2026-11-10T00:00:00.000Z');
    const favorite = {
      findMany: vi.fn().mockResolvedValue([{ workshopId: '1', title: 'a', officialPreviewUrl: null, type: 'scene', contentRating: 'everyone', createdAt }]),
      count: vi.fn().mockResolvedValue(1),
    };
    const result = await new FavoritesController({ db: { favorite } } as any).list('forest', '2', '24');
    expect(favorite.findMany).toHaveBeenCalledWith({ where: { OR: [{ title: { contains: 'forest' } }, { workshopId: { contains: 'forest' } }] }, orderBy: { createdAt: 'desc' }, skip: 24, take: 24 });
    expect(favorite.count).toHaveBeenCalledWith({ where: { OR: [{ title: { contains: 'forest' } }, { workshopId: { contains: 'forest' } }] } });
    expect(result).toEqual({ items: [{ workshopId: '1', title: 'a', officialPreviewUrl: null, type: 'scene', contentRating: 'everyone', createdAt: '2026-11-10T00:00:00.000Z' }], page: 2, pageSize: 24, total: 1 });
  });

  it('adds a favorite snapshot from the request body (idempotent upsert)', async () => {
    const createdAt = new Date('2026-11-10T00:00:00.000Z');
    const favorite = { upsert: vi.fn().mockResolvedValue({ workshopId: '123', title: 'My scene', officialPreviewUrl: 'http://x/p.jpg', type: 'scene', contentRating: 'everyone', createdAt }) };
    const result = await new FavoritesController({ db: { favorite } } as any).add('123', { title: 'My scene', officialPreviewUrl: 'http://x/p.jpg', type: 'scene', contentRating: 'everyone' });
    expect(favorite.upsert).toHaveBeenCalledWith({ where: { workshopId: '123' }, update: {}, create: { workshopId: '123', title: 'My scene', officialPreviewUrl: 'http://x/p.jpg', type: 'scene', contentRating: 'everyone' } });
    expect(result.createdAt).toBe('2026-11-10T00:00:00.000Z');
  });

  it('falls back to defaults for missing/invalid snapshot fields', async () => {
    const favorite = { upsert: vi.fn().mockResolvedValue({ workshopId: '123', title: '工坊壁纸 123', officialPreviewUrl: null, type: 'unknown', contentRating: 'unrated', createdAt: new Date() }) };
    await new FavoritesController({ db: { favorite } } as any).add('123', { type: 'bogus', contentRating: 'bogus' });
    expect(favorite.upsert).toHaveBeenCalledWith({ where: { workshopId: '123' }, update: {}, create: { workshopId: '123', title: '工坊壁纸 123', officialPreviewUrl: null, type: 'unknown', contentRating: 'unrated' } });
  });

  it('removes a favorite idempotently via deleteMany', async () => {
    const favorite = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const result = await new FavoritesController({ db: { favorite } } as any).remove('123');
    expect(favorite.deleteMany).toHaveBeenCalledWith({ where: { workshopId: '123' } });
    expect(result).toEqual({ deleted: 1 });
  });

  it('rejects an invalid workshop id before touching the database', async () => {
    const favorite = { upsert: vi.fn(), deleteMany: vi.fn() };
    const controller = new FavoritesController({ db: { favorite } } as any);
    await expect(controller.add('../etc', {})).rejects.toBeInstanceOf(Error);
    await expect(controller.remove('not-an-id!')).rejects.toBeInstanceOf(Error);
    expect(favorite.upsert).not.toHaveBeenCalled();
    expect(favorite.deleteMany).not.toHaveBeenCalled();
  });
});
