import type { DownloadProgress } from '@wallpaper-manager/contracts';

export type AuthStatus = 'authenticated' | 'authenticating' | 'auth_required' | 'guard_required' | 'email_required' | 'confirmation_required' | 'qr_required' | 'error';
export interface SteamQrLoginState { status: AuthStatus; qrCode: string | null; updatedAt: string | null }
export type ProgressListener = (progress: DownloadProgress) => void;

export interface SteamClient {
  readonly status: AuthStatus;
  readonly steamId: string | null;
  readonly accountName: string | null;
  initialize(): Promise<void>;
  login(username: string, password: string, steamId?: string): Promise<void>;
  startQrLogin(steamId?: string): Promise<void>;
  qrLoginState(): SteamQrLoginState;
  guard(code: string): Promise<void>;
  logout(): Promise<void>;
  download(target: string, workshopId: string, isCancelled: () => Promise<boolean>, onProgress?: ProgressListener): Promise<void>;
  close(): Promise<void>;
}
