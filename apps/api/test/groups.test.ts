import { describe, expect, it, vi } from 'vitest';
import { GroupsController } from '../src/groups/groups.controller';

const groupId = '11111111-1111-4111-8111-111111111111';

describe('wallpaper groups', () => {
  it('normalizes names and appends groups', async () => {
    const wallpaperGroup = {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ sortOrder: 2 }),
      create: vi.fn().mockResolvedValue({ id: groupId, name: '场景收藏', normalizedName: '场景收藏', color: '#4f8cff', sortOrder: 3, updatedAt: new Date(), _count: { items: 0 } }),
    };
    const result = await new GroupsController({ db: { wallpaperGroup } } as any).create({ name: '  场景收藏  ' });
    expect(wallpaperGroup.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: '场景收藏', normalizedName: '场景收藏', sortOrder: 3 }) }));
    expect(result).toMatchObject({ id: groupId, itemCount: 0, sortOrder: 3 });
  });

  it('returns system counts and playable counts', async () => {
    const db = {
      wallpaperGroup: { findMany: vi.fn().mockResolvedValue([{ id: groupId, name: '场景组', color: '#4f8cff', sortOrder: 0, updatedAt: new Date(), _count: { items: 3 } }]) },
      wallpaperGroupItem: { groupBy: vi.fn().mockResolvedValue([{ groupId, _count: { _all: 2 } }]) },
      wallpaper: { count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(3) },
    };
    const result = await new GroupsController({ db } as any).list();
    expect(result.system).toEqual({ all: 5, ungrouped: 3 });
    expect(result.items[0]).toMatchObject({ itemCount: 3, playableCount: 2 });
  });

  it('replaces wallpaper group assignments in one transaction', async () => {
    const wallpaperGroupItem = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const db = {
      wallpaper: { findUnique: vi.fn().mockResolvedValue({ workshopId: '123' }) },
      wallpaperGroup: { findMany: vi.fn().mockResolvedValue([{ id: groupId }]) },
      $transaction: vi.fn((callback) => callback({ wallpaperGroupItem })),
    };
    const result = await new GroupsController({ db } as any).assign('123', { groupIds: [groupId, groupId] });
    expect(wallpaperGroupItem.deleteMany).toHaveBeenCalledWith({ where: { workshopId: '123' } });
    expect(wallpaperGroupItem.createMany).toHaveBeenCalledWith({ data: [{ groupId, workshopId: '123' }] });
    expect(result).toEqual({ workshopId: '123', groupIds: [groupId] });
  });
});
