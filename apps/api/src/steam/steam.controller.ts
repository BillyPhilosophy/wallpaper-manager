import { Body, Controller, Get, Post, ServiceUnavailableException } from '@nestjs/common';
import type { SteamQrLoginState } from '@wallpaper-manager/contracts';
import { Infrastructure } from '../common';

async function workerControl(action: 'login' | 'guard' | 'logout' | 'qr/start', payload: Record<string, string> = {}): Promise<void> {
  try {
    const response = await fetch(`http://worker:9780/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(130000) });
    if (!response.ok) { const body = await response.json().catch(() => ({ message: 'Steam 登录请求失败' })) as { code?: string; message?: string }; throw new ServiceUnavailableException({ code: body.code || 'STEAM_AUTH_REQUIRED', message: body.message || 'Steam 登录请求失败' }); }
  } catch (error) { if (error instanceof ServiceUnavailableException) throw error; throw new ServiceUnavailableException({ code: 'STEAM_AUTH_REQUIRED', message: 'Worker 登录服务不可用' }); }
}

async function workerQrState(): Promise<SteamQrLoginState> {
  try {
    const response = await fetch('http://worker:9780/auth/qr', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('QR_UNAVAILABLE');
    return await response.json() as SteamQrLoginState;
  } catch {
    throw new ServiceUnavailableException({ code: 'STEAM_AUTH_REQUIRED', message: 'Worker 扫码登录服务不可用' });
  }
}

@Controller('steam/auth')
export class SteamController {
  constructor(private readonly infra: Infrastructure) {}
  @Get('status')
  async status() { const state = await this.infra.db.steamAuthState.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }); return { status: state.status, message: state.message, accountName: state.accountName, steamId: state.steamId, updatedAt: state.updatedAt.toISOString() }; }
  @Get('qr')
  async qr() { return workerQrState(); }
  @Post('qr')
  async startQr(@Body() body: { steamId?: unknown }) {
    if (body?.steamId !== undefined && body.steamId !== '' && (typeof body.steamId !== 'string' || !/^7656119\d{10}$/.test(body.steamId))) return { status: 'error', message: 'SteamID64 格式无效' };
    await workerControl('qr/start', typeof body?.steamId === 'string' && body.steamId ? { steamId: body.steamId } : {});
    return workerQrState();
  }
  @Post('login')
  async login(@Body() body: { username?: unknown; password?: unknown; steamId?: unknown }) {
    if (typeof body?.username !== 'string' || !body.username.trim() || typeof body.password !== 'string' || !body.password) return { status: 'error', message: '用户名和密码不能为空' };
    if (body.steamId !== undefined && body.steamId !== '' && (typeof body.steamId !== 'string' || !/^7656119\d{10}$/.test(body.steamId))) return { status: 'error', message: 'SteamID64 格式无效' };
    await workerControl('login', { username: body.username, password: body.password, ...(typeof body.steamId === 'string' && body.steamId ? { steamId: body.steamId } : {}) }); return this.status();
  }
  @Post('guard')
  async guard(@Body() body: { code?: unknown }) {
    if (typeof body?.code !== 'string' || !body.code.trim()) return { status: 'error', message: 'Guard 验证码不能为空' };
    await workerControl('guard', { code: body.code }); return this.status();
  }
  @Post('logout')
  async logout() { await workerControl('logout'); return this.status(); }
}
