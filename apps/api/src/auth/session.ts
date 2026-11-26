import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sessionCookieName = 'wm_session';

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSession(secret: string, nowMs = Date.now(), ttlSeconds = 43_200): string {
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = `${expiresAt}.${randomBytes(18).toString('base64url')}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function validSession(token: string | undefined, secret: string, nowMs = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  if (Number(parts[0]) <= Math.floor(nowMs / 1000)) return false;
  const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`, secret));
  const supplied = Buffer.from(parts[2]);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function sessionFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== sessionCookieName) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

export function sessionCookie(token: string, ttlSeconds = 43_200): string {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttlSeconds}`;
}

export function clearSessionCookie(): string {
  return `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
