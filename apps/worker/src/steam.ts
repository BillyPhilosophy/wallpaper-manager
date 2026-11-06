export type AuthStatus = 'authenticated' | 'auth_required' | 'guard_required' | 'qr_required' | 'error';
export interface SteamQrLoginState { status: AuthStatus; qrCode: string | null; updatedAt: string | null }

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
  download(target: string, workshopId: string, isCancelled: () => Promise<boolean>): Promise<void>;
  close(): Promise<void>;
}
