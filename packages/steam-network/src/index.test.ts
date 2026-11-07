import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SteamNetworkController } from './index';

function ok() { return new Response('{}', { status: 200 }); }
function route(call: unknown[]): string { return (call[1] as { dispatcher: { constructor: { name: string } } }).dispatcher.constructor.name; }
afterEach(() => { vi.unstubAllEnvs(); });

describe('Steam network modes', () => {
  it('uses direct connections without probing in direct mode', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'direct');
    const fetchMock = vi.fn().mockResolvedValue(ok());
    await new SteamNetworkController(fetchMock).fetchSteam('https://example.test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(route(fetchMock.mock.calls[0])).toBe('Agent');
  });

  it('uses only the configured proxy in proxy mode', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'proxy');
    vi.stubEnv('STEAM_PROXY_URL', 'http://proxy.test:7890');
    const fetchMock = vi.fn().mockResolvedValue(ok());
    await new SteamNetworkController(fetchMock).fetchSteam('https://example.test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(route(fetchMock.mock.calls[0])).toBe('ProxyAgent');
  });

  it('falls back to proxy only after a direct network failure and sticks with it', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'auto');
    vi.stubEnv('STEAM_PROXY_URL', 'http://proxy.test:7890');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('connection failed'))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    const network = new SteamNetworkController(fetchMock);
    await network.fetchSteam('https://example.test');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(route(fetchMock.mock.calls[0])).toBe('Agent');
    expect(route(fetchMock.mock.calls[1])).toBe('ProxyAgent');
    expect(route(fetchMock.mock.calls[2])).toBe('ProxyAgent');
    await network.fetchSteam('https://example.test/again');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(route(fetchMock.mock.calls[2])).toBe('ProxyAgent');
  });

  it('switches a cached direct route to proxy after a network error', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'auto');
    vi.stubEnv('STEAM_PROXY_URL', 'http://proxy.test:7890');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(ok());
    const network = new SteamNetworkController(fetchMock);
    await network.fetchSteam('https://example.test');
    expect(route(fetchMock.mock.calls[2])).toBe('ProxyAgent');
  });

  it('does not treat upstream HTTP errors as a reason to change routes', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'auto');
    vi.stubEnv('STEAM_PROXY_URL', 'http://proxy.test:7890');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    const network = new SteamNetworkController(fetchMock);
    await expect(network.fetchSteam('https://example.test')).rejects.toMatchObject({ name: 'HttpStatusError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applies and removes proxy variables for child processes', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'direct');
    vi.stubEnv('HTTP_PROXY', 'http://proxy.test:7890');
    const direct = await new SteamNetworkController().processEnv({ HTTP_PROXY: 'http://proxy.test:7890', HOME: '/tmp' });
    expect(direct.HTTP_PROXY).toBeUndefined();
    vi.stubEnv('STEAM_NETWORK_MODE', 'proxy');
    vi.stubEnv('STEAM_PROXY_URL', 'http://proxy.test:7890');
    const proxy = await new SteamNetworkController().processEnv({ HOME: '/tmp' });
    expect(proxy.STEAM_PROXY_URL).toBe('http://proxy.test:7890');
    expect(proxy.HTTPS_PROXY).toBe('http://proxy.test:7890');
  });

  it('uses the same undici implementation for fetch and dispatchers in a real request', async () => {
    vi.stubEnv('STEAM_NETWORK_MODE', 'direct');
    const server = createServer((_request, response) => response.end('ok'));
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      const response = await new SteamNetworkController().fetchSteam(`http://127.0.0.1:${port}/`);
      expect(await response.text()).toBe('ok');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('uses the matching undici fetch with a real proxy dispatcher', async () => {
    const server = createServer((_request, response) => response.end('proxy'));
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      vi.stubEnv('STEAM_NETWORK_MODE', 'proxy');
      vi.stubEnv('STEAM_PROXY_URL', `http://127.0.0.1:${port}`);
      const response = await new SteamNetworkController().fetchSteam('http://example.test/');
      expect(await response.text()).toBe('proxy');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
