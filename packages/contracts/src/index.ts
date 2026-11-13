export const WALLPAPER_TYPES = ['scene', 'web', 'video', 'image', 'application', 'unknown'] as const;
export const CONTENT_RATINGS = ['everyone', 'pg13', 'mature', 'unrated'] as const;
export const WALLPAPER_STATUSES = ['not_downloaded', 'queued', 'downloading', 'verifying', 'publishing', 'downloaded', 'deleting'] as const;
export const DOWNLOAD_STATUSES = ['queued', 'downloading', 'verifying', 'publishing', 'succeeded', 'failed', 'cancelled'] as const;
export const ACTIVE_DOWNLOAD_STATUSES = ['queued', 'downloading', 'verifying', 'publishing'] as const;
export type WallpaperType = typeof WALLPAPER_TYPES[number];
export type ContentRating = typeof CONTENT_RATINGS[number];
export type WallpaperStatus = typeof WALLPAPER_STATUSES[number];
export type DownloadStatus = typeof DOWNLOAD_STATUSES[number];
export type SteamAuthStatus = 'authenticated' | 'authenticating' | 'auth_required' | 'guard_required' | 'email_required' | 'confirmation_required' | 'qr_required' | 'error';
export interface SteamQrLoginState { status: SteamAuthStatus; qrCode: string | null; updatedAt: string | null }
export type ErrorCode = 'STEAM_AUTH_REQUIRED' | 'STEAM_GUARD_REQUIRED' | 'STEAM_RATE_LIMITED' | 'STEAM_DOWNLOAD_FAILED' | 'DOWNLOAD_TIMEOUT' | 'DISK_FULL' | 'WORKSHOP_ITEM_NOT_FOUND' | 'UNSUPPORTED_TYPE' | 'INVALID_PROJECT' | 'RESOURCE_MISSING' | 'PATH_UNSAFE' | 'PUBLISH_CONFLICT' | 'CANCELLED' | 'INTERNAL_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'STEAM_API_UNAVAILABLE' | 'STEAM_ID_REQUIRED';

export interface ApiError { code: ErrorCode | string; message: string; requestId: string }
export interface Wallpaper {
  workshopId: string; title: string; description: string | null; type: WallpaperType;
  contentRating: ContentRating; subscribed: boolean; favorited: boolean;
  officialPreviewUrl: string | null; metadataJson: unknown; localRelativePath: string | null;
  status: WallpaperStatus; fileSizeBytes: string | null; lastErrorCode: string | null;
  lastErrorMessage: string | null; downloadedAt: string | null; createdAt: string; updatedAt: string;
}
export interface Favorite {
  workshopId: string; title: string; officialPreviewUrl: string | null;
  type: WallpaperType; contentRating: ContentRating; createdAt: string;
}
export interface DownloadProgress {
  downloadedBytes: string; totalBytes: string; networkBytes: string;
  bytesPerSecond: string; percent: number | null; updatedAt: string;
}
export interface DownloadJob {
  id: string; workshopId: string; status: DownloadStatus; attempt: number;
  errorCode: string | null; errorMessage: string | null; createdAt: string;
  startedAt: string | null; finishedAt: string | null;
  progress?: DownloadProgress;
}
export interface WorkshopItem {
  workshopId: string; title: string; description: string | null; type: WallpaperType;
  contentRating: ContentRating; subscribed: boolean; favorited: boolean;
  officialPreviewUrl: string | null; previewContentType: string | null;
  metadataJson: Record<string, unknown>; localStatus: WallpaperStatus;
}
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export interface WorkshopSearchResult { items: WorkshopItem[]; cursor: string | null; total: number }
export interface PreviewDescriptor {
  workshopId: string; mode: 'webwallgl' | 'web-sandbox' | 'local-video' | 'official-preview';
  type: WallpaperType; resourceBaseUrl?: string; entry?: string;
  fallbackPreviewUrl: string | null; degraded: boolean; message: string | null;
}
export interface Capabilities { workerReady: boolean; steamAuthenticated: boolean; livePreviewTypes: ['scene', 'web']; webwallglVersion: '3.0.2' }
export interface SteamAuthState { status: SteamAuthStatus; message: string | null; accountName: string | null; steamId: string | null; updatedAt: string }
export type AuthControl = { type: 'login'; username: string; secret: string; steamId?: string } | { type: 'qr'; steamId?: string } | { type: 'guard'; secret: string } | { type: 'logout' };
export interface QueueLength { length: number }
