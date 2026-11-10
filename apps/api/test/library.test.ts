import { describe, expect, it, vi } from 'vitest';
import { WallpapersController } from '../src/wallpapers/wallpapers.controller';

describe('wallpaper library filters', () => {
  it('filters subscribed items independently with numbered pagination', async () => {
    const wallpaper = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
    const favorite = { findMany: vi.fn().mockResolvedValue([]) };
    const result = await new WallpapersController({ db: { wallpaper, favorite } } as any).list('', '', '', '', 'true', '2', '24');
    expect(wallpaper.findMany).toHaveBeenCalledWith({ where: { subscribed: true }, orderBy: { updatedAt: 'desc' }, skip: 24, take: 24 });
    expect(wallpaper.count).toHaveBeenCalledWith({ where: { subscribed: true } });
    expect(result).toEqual({ items: [], page: 2, pageSize: 24, total: 0 });
  });

  it('annotates each item with favorited from a single batch query', async () => {
    const now = new Date();
    const rows = [
      { workshopId: '1', title: 'a', metadataJson: '{}', fileSizeBytes: null, status: 'downloaded', createdAt: now, updatedAt: now, downloadedAt: null },
      { workshopId: '2', title: 'b', metadataJson: '{}', fileSizeBytes: null, status: 'downloaded', createdAt: now, updatedAt: now, downloadedAt: null },
    ];
    const wallpaper = { findMany: vi.fn().mockResolvedValue(rows), count: vi.fn().mockResolvedValue(2) };
    const favorite = { findMany: vi.fn().mockResolvedValue([{ workshopId: '1' }]) };
    const result = await new WallpapersController({ db: { wallpaper, favorite } } as any).list('', '', '', 'downloaded', '', '1', '24');
    expect(favorite.findMany).toHaveBeenCalledTimes(1);
    expect(favorite.findMany).toHaveBeenCalledWith({ where: { workshopId: { in: ['1', '2'] } }, select: { workshopId: true } });
    expect(result.items.map((i: any) => [i.workshopId, i.favorited])).toEqual([['1', true], ['2', false]]);
  });
});
