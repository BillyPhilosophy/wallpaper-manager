import type { Page, Wallpaper } from '@wallpaper-manager/contracts';
import { api } from '../../api';

export type RotationOrder = 'sequence' | 'random';

export async function loadRotationWallpapers(groupId: string): Promise<Wallpaper[]> {
  const items: Wallpaper[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await api<Page<Wallpaper>>(`/wallpapers?status=downloaded&groupId=${encodeURIComponent(groupId)}&page=${page}&pageSize=100`);
    items.push(...result.items.filter((item) => ['scene', 'web', 'video'].includes(item.type)));
    total = result.total;
    page += 1;
  } while ((page - 1) * 100 < total && page <= 100);
  return items;
}

export function nextRotationId(items: Wallpaper[], currentId: string | null, order: RotationOrder, random = Math.random): string | null {
  if (!items.length) return null;
  if (items.length === 1) return items[0].workshopId;
  if (order === 'random') {
    const candidates = items.filter((item) => item.workshopId !== currentId);
    return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))].workshopId;
  }
  const index = items.findIndex((item) => item.workshopId === currentId);
  return items[(index + 1 + items.length) % items.length].workshopId;
}
