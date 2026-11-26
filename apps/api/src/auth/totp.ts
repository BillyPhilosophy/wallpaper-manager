import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(secret: string): Buffer {
  const normalized = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('Invalid Base32 secret');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function totp(secret: string, timestampMs = Date.now()): string {
  return totpAtStep(secret, Math.floor(timestampMs / 30_000));
}

export function totpAtStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}

export function matchingTotpStep(secret: string, code: string, timestampMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const currentStep = Math.floor(timestampMs / 30_000);
  for (let step = currentStep - 1; step <= currentStep + 1; step++) {
    const expected = Buffer.from(totpAtStep(secret, step));
    const supplied = Buffer.from(code);
    if (timingSafeEqual(expected, supplied)) return step;
  }
  return null;
}
