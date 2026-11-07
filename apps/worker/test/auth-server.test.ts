import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { startAuthServer } from '../src/auth-server';
import type { SteamClient } from '../src/steam';

describe('worker authentication server', () => {
  it('returns before password login finishes and logs only safe background errors', async () => {
    let rejectLogin!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, reject) => { rejectLogin = reject; });
    const login = vi.fn(() => pending);
    const steam = {
      status: 'authenticating', steamId: null, accountName: null,
      initialize: vi.fn(), login, startQrLogin: vi.fn(), qrLoginState: vi.fn(), guard: vi.fn(), logout: vi.fn(), download: vi.fn(), close: vi.fn(),
    } as unknown as SteamClient;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = startAuthServer(steam, 0);
    try {
      await new Promise<void>((resolve) => { if (server.listening) resolve(); else server.once('listening', resolve); });
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'test', password: 'secret' }) });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ status: 'authenticating' });
      expect(login).toHaveBeenCalledWith('test', 'secret', undefined);
      rejectLogin(new Error('STEAM_NETWORK_UNAVAILABLE'));
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[auth] request=/auth/login result=failed code=STEAM_NETWORK_UNAVAILABLE'));
      const logs = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
      expect(logs).not.toContain('secret');
      expect(logs).not.toContain('127.0.0.1');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      log.mockRestore();
      warn.mockRestore();
    }
  });
});
