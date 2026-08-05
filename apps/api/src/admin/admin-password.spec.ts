import { describe, expect, it } from 'vitest';
import { hashAdminPassword, verifyAdminPassword } from './admin-password';

describe('admin password hashing', () => {
  it('verifies a generated hash and rejects a different password', () => {
    const encoded = hashAdminPassword('correct horse battery staple');
    expect(verifyAdminPassword('correct horse battery staple', encoded)).toBe(true);
    expect(verifyAdminPassword('wrong password', encoded)).toBe(false);
  });

  it('rejects malformed or unsafe parameter hashes', () => {
    expect(verifyAdminPassword('secret', 'not-a-hash')).toBe(false);
    expect(verifyAdminPassword('secret', 'scrypt-v1$1$1$1$c2FsdA$aGFzaA')).toBe(false);
  });
});

