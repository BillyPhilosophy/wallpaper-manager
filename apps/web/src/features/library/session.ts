import type { ContentRating, WallpaperType } from '@wallpaper-manager/contracts';
import { ratingLabel, statusLabel, typeLabel } from '../../api';
import { readSession, writeSession } from '../session-storage';

export const typeOptions = (Object.keys(typeLabel) as WallpaperType[]).map((value) => ({ value, label: typeLabel[value] }));
export const ratingOptions = (Object.keys(ratingLabel) as ContentRating[]).map((value) => ({ value, label: ratingLabel[value] }));
const statuses = ['', ...Object.keys(statusLabel).slice(0, 7)];

const defaults = {
  q: '',
  types: typeOptions.map((option) => option.value),
  ratings: ratingOptions.map((option) => option.value),
  status: '',
  page: 1,
};
const restored = readSession('wallpaper-library', defaults);
if (typeof restored.q !== 'string') restored.q = '';
if (!Array.isArray(restored.types)) restored.types = [...defaults.types];
if (!Array.isArray(restored.ratings)) restored.ratings = [...defaults.ratings];
restored.types = restored.types.filter((value) => typeOptions.some((option) => option.value === value));
restored.ratings = restored.ratings.filter((value) => ratingOptions.some((option) => option.value === value));
if (!statuses.includes(restored.status)) restored.status = '';
if (!Number.isSafeInteger(restored.page) || restored.page < 1) restored.page = 1;
export const librarySession = restored;

export function saveLibrarySession(): void {
  writeSession('wallpaper-library', librarySession);
}
