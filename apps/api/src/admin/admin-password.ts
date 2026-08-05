import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const VERSION = 'scrypt-v1';
const KEY_LENGTH = 32;
const DEFAULTS = { N: 16384, r: 8, p: 1 };

export function hashAdminPassword(password: string, salt = randomBytes(16)): string {
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: DEFAULTS.N,
    r: DEFAULTS.r,
    p: DEFAULTS.p,
    maxmem: 32 * 1024 * 1024,
  });
  return [VERSION, DEFAULTS.N, DEFAULTS.r, DEFAULTS.p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export function verifyAdminPassword(password: string, encoded: string): boolean {
  try {
    const [version, nValue, rValue, pValue, saltValue, hashValue] = encoded.split('$');
    const n = Number(nValue);
    const r = Number(rValue);
    const p = Number(pValue);
    if (version !== VERSION || !Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    if (n < 16384 || n > 32768 || r < 1 || r > 16 || p < 1 || p > 4 || !saltValue || !hashValue) return false;
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

