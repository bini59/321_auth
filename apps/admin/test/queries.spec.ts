import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { getCsrfToken } from '@/api/queries';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('fetches the csrf token once per page load (the server rotates the cookie on every call)', async () => {
  let calls = 0;
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ csrfToken: 'tok-' + ++calls }));
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient();

  expect(await getCsrfToken(qc)).toBe('tok-1');
  expect(await getCsrfToken(qc)).toBe('tok-1');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
