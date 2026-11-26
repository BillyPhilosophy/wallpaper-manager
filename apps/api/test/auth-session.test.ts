import { describe, expect, it } from 'vitest';
import { clearSessionCookie, createSession, sessionCookie, sessionFromCookie, validSession } from '../src/auth/session';

const secret = 'test-session-secret-with-at-least-32-characters';

describe('website sessions', () => {
  it('accepts a valid signed cookie and rejects altered or expired sessions', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const token = createSession(secret, now, 300);
    expect(validSession(token, secret, now + 299_000)).toBe(true);
    expect(validSession(token, secret, now + 300_000)).toBe(false);
    expect(validSession(`${token}x`, secret, now)).toBe(false);
    expect(validSession(token, 'another-session-secret-with-32-characters', now)).toBe(false);
  });

  it('reads only the website session cookie', () => {
    expect(sessionFromCookie('other=value; wm_session=abc.def.ghi; theme=dark')).toBe('abc.def.ghi');
    expect(sessionFromCookie('other=value')).toBeUndefined();
    expect(sessionFromCookie('wm_session=bad%value')).toBeUndefined();
  });

  it('uses secure cookie attributes and clears the same cookie on logout', () => {
    expect(sessionCookie('token')).toContain('Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200');
    expect(clearSessionCookie()).toContain('wm_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  });
});
