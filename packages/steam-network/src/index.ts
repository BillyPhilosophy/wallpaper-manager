import { Agent, ProxyAgent, type Dispatcher } from 'undici';

export type NetworkMode = 'direct' | 'proxy' | 'auto';
export type NetworkRoute = 'direct' | 'proxy';
type Fetch = typeof globalThis.fetch;

const PROBE_URL = 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/';
const ROUTE_TTL_MS = 15 * 60 * 1000;

export class SteamNetworkController {
  readonly mode: NetworkMode;
  private readonly proxyUrl: string | null;
  private readonly directAgent: Dispatcher;
  private readonly proxyAgent: Dispatcher | null;
  private route: NetworkRoute = 'direct';
  private routeExpiresAt = 0;
  private pending: Promise<NetworkRoute> | null = null;

  constructor(private readonly fetchImpl: Fetch = globalThis.fetch, private readonly probeTimeoutMs = 5000) {
    const configuredMode = process.env.STEAM_NETWORK_MODE as NetworkMode | '' | undefined;
    this.proxyUrl = process.env.STEAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
    this.mode = configuredMode || (this.proxyUrl ? 'proxy' : 'direct');
    if (this.mode === 'proxy' && !this.proxyUrl) throw new Error('STEAM_PROXY_NOT_CONFIGURED');
    if (this.mode === 'auto' && !this.proxyUrl) this.mode = 'direct';
    this.directAgent = new Agent();
    this.proxyAgent = this.proxyUrl ? new ProxyAgent(this.proxyUrl) : null;
  }

  async fetchSteam(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.mode !== 'auto') return this.dispatch(this.mode, url, init);
    const route = await this.selectRoute();
    try {
      return await this.dispatch(route, url, init);
    } catch (error) {
      if (route === 'proxy' || !isNetworkError(error)) throw error;
      this.rememberRoute('proxy');
      return this.dispatch('proxy', url, init);
    }
  }

  async processEnv(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
    const route = await this.selectRoute();
    const next = { ...env };
    for (const key of ['STEAM_PROXY_URL', 'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) delete next[key];
    if (route === 'proxy' && this.proxyUrl) {
      next.STEAM_PROXY_URL = this.proxyUrl;
      next.HTTP_PROXY = this.proxyUrl;
      next.HTTPS_PROXY = this.proxyUrl;
      next.http_proxy = this.proxyUrl;
      next.https_proxy = this.proxyUrl;
    }
    return next;
  }

  private async selectRoute(): Promise<NetworkRoute> {
    if (this.mode !== 'auto') return this.mode;
    if (Date.now() < this.routeExpiresAt) return this.route;
    if (!this.pending) this.pending = this.probeRoute().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async probeRoute(): Promise<NetworkRoute> {
    try {
      const response = await this.dispatch('direct', PROBE_URL, {}, this.probeTimeoutMs);
      if (!response.ok) {
        const error = new Error('STEAM_API_UNAVAILABLE');
        error.name = 'HttpStatusError';
        throw error;
      }
      this.rememberRoute('direct');
      return 'direct';
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
    const response = await this.dispatch('proxy', PROBE_URL, {}, this.probeTimeoutMs);
    if (!response.ok) {
      const error = new Error('STEAM_API_UNAVAILABLE');
      error.name = 'HttpStatusError';
      throw error;
    }
    this.rememberRoute('proxy');
    return 'proxy';
  }

  private rememberRoute(route: NetworkRoute): void {
    this.route = route;
    this.routeExpiresAt = Date.now() + ROUTE_TTL_MS;
  }

  private async dispatch(route: NetworkRoute, url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
    const dispatcher = route === 'proxy' ? this.proxyAgent : this.directAgent;
    if (!dispatcher) throw new Error('STEAM_PROXY_NOT_CONFIGURED');
    return this.fetchImpl(url, { ...init, dispatcher, signal: init.signal || AbortSignal.timeout(timeoutMs) } as unknown as RequestInit);
  }
}

function isNetworkError(error: unknown): boolean {
  return !(error instanceof Error && ['AbortError', 'HttpStatusError'].includes(error.name));
}
