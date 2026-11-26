import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { sessionCookie } from '../src/auth/session';
import { totp } from '../src/auth/totp';

class FakeRedis {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async incr(key: string) { const value = Number(this.values.get(key) || 0) + 1; this.values.set(key, String(value)); return value; }
  async expire() { return 1; }
  async del(key: string) { return this.values.delete(key) ? 1 : 0; }
  async eval(_script: string, _keys: number, key: string, step: string) {
    const previous = Number(this.values.get(key) ?? -1);
    if (Number(step) <= previous) return 0;
    this.values.set(key, step);
    return 1;
  }
}

describe('website authentication', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_TOTP_SECRET', 'JBSWY3DPEHPK3PXP');
    vi.stubEnv('AUTH_SESSION_SECRET', 'test-session-secret-with-at-least-32-characters');
    vi.stubEnv('AUTH_SESSION_TTL_SECONDS', '43200');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('creates a session after a valid code', async () => {
    const redis = new FakeRedis();
    const auth = new AuthService({ redis } as any);
    const token = await auth.login(totp('JBSWY3DPEHPK3PXP'));
    expect(token).toBeTruthy();
    expect(() => auth.check(sessionCookie(token!).split(';')[0])).not.toThrow();
  });

  it('rejects replay of a previously accepted code', async () => {
    const auth = new AuthService({ redis: new FakeRedis() } as any);
    const code = totp('JBSWY3DPEHPK3PXP');
    await auth.login(code);
    await expect(auth.login(code)).rejects.toMatchObject({ status: 401 });
  });

  it('limits repeated failures', async () => {
    const auth = new AuthService({ redis: new FakeRedis() } as any);
    for (let attempt = 0; attempt < 5; attempt++) await expect(auth.login('000000')).rejects.toMatchObject({ status: 401 });
    await expect(auth.login(totp('JBSWY3DPEHPK3PXP'))).rejects.toMatchObject({ status: 429 });
  });

  it('fails closed when only one secret is configured', async () => {
    vi.stubEnv('AUTH_SESSION_SECRET', '');
    const auth = new AuthService({ redis: new FakeRedis() } as any);
    expect(() => auth.check(undefined)).toThrow();
    await expect(auth.login('123456')).rejects.toMatchObject({ status: 503 });
  });

  it('keeps existing deployments accessible when authentication is not configured', async () => {
    vi.stubEnv('AUTH_TOTP_SECRET', '');
    vi.stubEnv('AUTH_SESSION_SECRET', '');
    const auth = new AuthService({ redis: new FakeRedis() } as any);
    expect(() => auth.check(undefined)).not.toThrow();
    await expect(auth.login('')).resolves.toBeNull();
  });
});
