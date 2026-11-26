import { describe, expect, it } from 'vitest';
import { parseApiEnv } from './index';

describe('API authentication environment', () => {
  it('treats empty Compose secrets as disabled authentication', () => {
    const env = parseApiEnv({ AUTH_TOTP_SECRET: '', AUTH_SESSION_SECRET: '' });
    expect(env.AUTH_TOTP_SECRET).toBeUndefined();
    expect(env.AUTH_SESSION_SECRET).toBeUndefined();
  });

  it('accepts generated authentication secrets', () => {
    const env = parseApiEnv({ AUTH_TOTP_SECRET: 'JBSWY3DPEHPK3PXP', AUTH_SESSION_SECRET: 'test-session-secret-with-at-least-32-characters' });
    expect(env.AUTH_TOTP_SECRET).toBe('JBSWY3DPEHPK3PXP');
    expect(env.AUTH_SESSION_TTL_SECONDS).toBe(43200);
  });

  it('still rejects malformed nonempty secrets', () => {
    expect(() => parseApiEnv({ AUTH_TOTP_SECRET: 'invalid!', AUTH_SESSION_SECRET: 'short' })).toThrow();
  });
});
