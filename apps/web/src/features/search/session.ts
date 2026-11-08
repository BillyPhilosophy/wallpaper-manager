import type { ContentRating, WallpaperType, WorkshopSearchResult } from '@wallpaper-manager/contracts';
import { ratingLabel, typeLabel } from '../../api';
import { readSession, writeSession } from '../session-storage';

export type SearchType = Exclude<WallpaperType, 'unknown'>;
export type SearchRating = Exclude<ContentRating, 'unrated'>;

export const typeOptions = (['scene', 'web', 'video', 'image', 'application'] as SearchType[]).map((value) => ({ value, label: typeLabel[value] }));
export const ratingOptions = (['everyone', 'pg13', 'mature'] as SearchRating[]).map((value) => ({ value, label: ratingLabel[value] }));

const defaults = {
  input: '',
  query: '',
  page: 1,
  types: typeOptions.map((option) => option.value),
  ratings: ratingOptions.map((option) => option.value),
  scrollY: 0,
};
const restored = readSession('wallpaper-search', defaults);
if (!Array.isArray(restored.types)) restored.types = [...defaults.types];
if (!Array.isArray(restored.ratings)) restored.ratings = [...defaults.ratings];
restored.types = restored.types.filter((value) => typeOptions.some((option) => option.value === value));
restored.ratings = restored.ratings.filter((value) => ratingOptions.some((option) => option.value === value));
if (typeof restored.input !== 'string') restored.input = '';
if (typeof restored.query !== 'string') restored.query = '';
if (!Number.isSafeInteger(restored.page) || restored.page < 1) restored.page = 1;
if (!Number.isFinite(restored.scrollY) || restored.scrollY < 0) restored.scrollY = 0;
export const searchSession = restored;

export function saveSearchSession(): void {
  writeSession('wallpaper-search', searchSession);
}

const cache = new Map<string, { expires: number; value: WorkshopSearchResult }>();
const pending = new Map<string, Promise<WorkshopSearchResult>>();

export function searchKey(query: string, page: number, types: SearchType[], ratings: SearchRating[]): string {
  return JSON.stringify([query, page, types, ratings]);
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
