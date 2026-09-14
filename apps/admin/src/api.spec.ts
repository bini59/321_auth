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

const token = 'test-csrf';
const serviceId = 'service/a ?';
const userId = 'user/b ?';
const servicePath = '/admin/services/service%2Fa%20%3F';
const userPath = '/admin/api/users/user%2Fb%20%3F';
const payload = { name: '서비스', auto_provision: false };

describe('admin mutation request contracts', () => {
  it.each([
    ['login', () => authApi.login('test-password', token, '/admin#users'), '/admin/auth/login', 'POST', { password: 'test-password', returnTo: '/admin#users' }],
    ['create', () => authApi.createService(payload, token), '/admin/services', 'POST', payload],
    ['update', () => authApi.updateService(serviceId, payload, token), servicePath, 'PATCH', payload],
    ['membership', () => authApi.updateMembership(userId, serviceId, token, { status: 'suspended' }), `${userPath}/memberships/service%2Fa%20%3F`, 'PATCH', { status: 'suspended' }],
    ['null body', () => authApi.createService(null, token), '/admin/services', 'POST', null],
    ['undefined body', () => authApi.createService(undefined, token), '/admin/services', 'POST', undefined],
    ['create alias', () => authApi.createClient(payload, token), '/admin/services', 'POST', payload],
    ['update alias', () => authApi.updateClient(serviceId, payload, token), servicePath, 'PATCH', payload],
  ] as const)('%s sends JSON with cookies and CSRF', async (_name, call, path, method, body) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(call()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(path, {
      credentials: 'include', method,
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify(body),
    });
  });

  it.each([
    ['logout', () => authApi.logout(token), '/admin/auth/logout', 'POST'],
    ['activate', () => authApi.setServiceActive(serviceId, true, token), `${servicePath}/activate`, 'POST'],
    ['deactivate', () => authApi.setServiceActive(serviceId, false, token), servicePath, 'DELETE'],
    ['rotate', () => authApi.rotateServiceSecret(serviceId, token), `${servicePath}/rotate-secret`, 'POST'],
    ['revoke', () => authApi.revokeSessions(userId, token), `${userPath}/revoke-sessions`, 'POST'],
    ['activate alias', () => authApi.setClientActive(serviceId, true, token), `${servicePath}/activate`, 'POST'],
    ['deactivate alias', () => authApi.setClientActive(serviceId, false, token), servicePath, 'DELETE'],
    ['rotate alias', () => authApi.rotateClientSecret(serviceId, token), `${servicePath}/rotate-secret`, 'POST'],
  ] as const)('%s sends cookies and CSRF without a JSON body', async (_name, call, path, method) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await call();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(path, {
      credentials: 'include', method, headers: { 'x-csrf-token': token },
    });
  });

  it.each(['/admin', '/admin/login'])('preserves unauthorized handling from %s', async (pathname) => {
    const replace = vi.fn();
    vi.stubGlobal('window', { location: { pathname, search: '?q=hello', hash: '#users', replace } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(authApi.logout(token)).rejects.toThrow('Auth API request failed (401)');
    if (pathname === '/admin/login') expect(replace).not.toHaveBeenCalled();
    else expect(replace).toHaveBeenCalledExactlyOnceWith('/admin/login?return_to=%2Fadmin%3Fq%3Dhello%23users');
  });

  it('propagates a rejected CSRF request without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApi.createService(payload, token)).rejects.toThrow('Auth API request failed (403)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
