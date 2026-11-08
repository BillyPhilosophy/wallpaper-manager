import type { ContentRating, WallpaperType, WorkshopSearchResult } from '@wallpaper-manager/contracts';
import { ratingLabel, typeLabel } from '../../api';

export type SearchType = Exclude<WallpaperType, 'unknown'>;
export type SearchRating = Exclude<ContentRating, 'unrated'>;

export const typeOptions = (['scene', 'web', 'video', 'image', 'application'] as SearchType[]).map((value) => ({ value, label: typeLabel[value] }));
export const ratingOptions = (['everyone', 'pg13', 'mature'] as SearchRating[]).map((value) => ({ value, label: ratingLabel[value] }));

export const searchSession = {
  input: '',
  query: '',
  cursor: '*',
  types: typeOptions.map((option) => option.value),
  ratings: ratingOptions.map((option) => option.value),
  scrollY: 0,
};

const cache = new Map<string, { expires: number; value: WorkshopSearchResult }>();
const pending = new Map<string, Promise<WorkshopSearchResult>>();

export function searchKey(query: string, cursor: string, types: SearchType[], ratings: SearchRating[]): string {
  return JSON.stringify([query, cursor, types, ratings]);
}

export async function cachedSearch(key: string, load: () => Promise<WorkshopSearchResult>): Promise<WorkshopSearchResult> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) cache.delete(key);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = load().then((value) => {
    cache.set(key, { value, expires: Date.now() + 60_000 });
    if (cache.size > 20) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}

export function invalidateSearch(key: string): void {
  cache.delete(key);
}
