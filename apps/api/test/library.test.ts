import { describe, expect, it, vi } from 'vitest';
import { WallpapersController } from '../src/wallpapers/wallpapers.controller';

describe('wallpaper library filters', () => {
  it('filters subscribed items independently with numbered pagination', async () => {
    const wallpaper = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
    const result = await new WallpapersController({ db: { wallpaper } } as any).list('', '', '', '', 'true', '2', '24');
    expect(wallpaper.findMany).toHaveBeenCalledWith({ where: { subscribed: true }, orderBy: { updatedAt: 'desc' }, skip: 24, take: 24 });
    expect(wallpaper.count).toHaveBeenCalledWith({ where: { subscribed: true } });
    expect(result).toEqual({ items: [], page: 2, pageSize: 24, total: 0 });
  });
});
