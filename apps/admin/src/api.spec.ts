import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin API client', () => {
  it('explains when an HTML shell is returned instead of JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })));

    await expect(authApi.services()).rejects.toThrow('Auth API returned non-JSON response (text/html)');
  });
});
