import { describe, expect, it } from 'vitest';
import { validateClientInput } from './client-input';

const valid = { client_id: 'archive-320', name: 'Archive', allowed_origins: ['https://archive.example'], default_redirect: 'https://archive.example/login', auto_provision: true };

describe('validateClientInput', () => {
  it('accepts exact origins and a redirect under one of them', () => expect(validateClientInput(valid).clientId).toBe('archive-320'));
  it('rejects origin lookalikes, paths, and redirects outside the allowlist', () => {
    expect(() => validateClientInput({ ...valid, allowed_origins: ['https://example.com/path'] })).toThrow();
    expect(() => validateClientInput({ ...valid, default_redirect: 'https://evil.example/' })).toThrow();
    expect(() => validateClientInput({ ...valid, allowed_origins: ['https://example.com.evil'] })).toThrow();
  });
  it('requires a boolean auto_provision value', () => expect(() => validateClientInput({ ...valid, auto_provision: 'true' })).toThrow());
});
