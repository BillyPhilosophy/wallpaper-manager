import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
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

describe('authentication HTTP endpoints', () => {
  let app: Express;
  beforeEach(() => {
    vi.stubEnv('AUTH_TOTP_SECRET', 'JBSWY3DPEHPK3PXP');
    vi.stubEnv('AUTH_SESSION_SECRET', 'test-session-secret-with-at-least-32-characters');
    vi.stubEnv('AUTH_SESSION_TTL_SECONDS', '43200');
    const controller = new AuthController(new AuthService({ redis: new FakeRedis() } as any));
    app = express();
    app.use(express.json({ limit: '16kb' }));
    app.get('/api/auth/check', (req, res) => controller.check(req, res));
    app.post('/api/auth/login', (req, res, next) => { void controller.login(req.body, res).catch(next); });
    app.post('/api/auth/logout', (_req, res) => controller.logout(res));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sets a secure session cookie and rejects replay over HTTP', async () => {
    await request(app).get('/api/auth/check').expect(401);
    const code = totp('JBSWY3DPEHPK3PXP');
    const login = await request(app).post('/api/auth/login').send({ code }).expect(200);
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
    await request(app).get('/api/auth/check').set('Cookie', cookie).expect(204);
    await request(app).post('/api/auth/login').send({ code }).expect(401);
    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    expect(logout.headers['set-cookie'][0]).toContain('Max-Age=0');
  });
});
