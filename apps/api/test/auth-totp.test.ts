import { describe, expect, it } from 'vitest';
import { decodeBase32, generateTotpSecret, matchingTotpStep, totp, totpAtStep } from '../src/auth/totp';

const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP', () => {
  it.each([
    [59_000, '287082'],
    [1_111_111_109_000, '081804'],
    [1_234_567_890_000, '005924'],
  ])('matches RFC 6238 SHA-1 vectors at %i', (timestamp, expected) => {
    expect(totp(rfcSecret, timestamp)).toBe(expected);
  });

  it('accepts the adjacent time windows and rejects other codes', () => {
    const now = 1_234_567_890_000;
    const step = Math.floor(now / 30_000);
    expect(matchingTotpStep(rfcSecret, totpAtStep(rfcSecret, step - 1), now)).toBe(step - 1);
    expect(matchingTotpStep(rfcSecret, totpAtStep(rfcSecret, step + 1), now)).toBe(step + 1);
    expect(matchingTotpStep(rfcSecret, 'abc123', now)).toBeNull();
  });

  it('generates reusable Base32 secrets and rejects malformed input', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(decodeBase32(secret)).toHaveLength(20);
    expect(() => decodeBase32('not-valid!')).toThrow('Invalid Base32 secret');
  });
});
