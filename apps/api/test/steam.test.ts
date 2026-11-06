import { afterEach, describe, expect, it, vi } from 'vitest';
import { SteamController } from '../src/steam/steam.controller';

const state = { status: 'authenticated', message: null, accountName: 'test', steamId: '76561197960265851', updatedAt: new Date('2026-01-01T00:00:00Z') };

function controller() {
  const db = { steamAuthState: { upsert: vi.fn().mockResolvedValue(state) } };
  return new SteamController({ db } as any);
}

describe('Steam authentication API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns non-secret account state', async () => {
    const result = await controller().status();
    expect(result).toEqual({ status: 'authenticated', message: null, accountName: 'test', steamId: '76561197960265851', updatedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('rejects an invalid SteamID64 before calling the worker', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await controller().login({ username: 'test', password: 'secret', steamId: 'invalid' });
    expect(result).toEqual({ status: 'error', message: 'SteamID64 格式无效' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards an optional SteamID64 with the internal login request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await controller().login({ username: 'test', password: 'secret', steamId: '76561197960265851' });
    expect(result.status).toBe('authenticated');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ username: 'test', password: 'secret', steamId: '76561197960265851' });
  });

  it('starts QR login and reads the in-memory worker state', async () => {
    const qrState = { status: 'qr_required', qrCode: '██ TEST', updatedAt: '2026-01-01T00:00:00.000Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(qrState), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await controller().startQr({ steamId: '76561197960265851' })).toEqual(qrState);
    expect(fetchMock.mock.calls[0][0]).toBe('http://worker:9780/auth/qr/start');
    expect(fetchMock.mock.calls[1][0]).toBe('http://worker:9780/auth/qr');
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ steamId: '76561197960265851' });
  });
});
