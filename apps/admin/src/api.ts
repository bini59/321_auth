import type { AuthenticatedUser, HealthResponse } from '@321-auth/contracts';
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { credentials: 'include', ...init }); if (!response.ok) throw new Error(`Auth API request failed (${response.status})`); return response.json() as Promise<T>; }
export interface AdminSessionResponse { authenticated: true }
export interface AdminCsrfResponse { csrfToken: string }
export interface AdminLoginResponse { ok: true; returnTo: string }
export const authApi = {
  health: () => request<HealthResponse>('/healthz'),
  currentUser: () => request<AuthenticatedUser>('/me'),
  csrf: () => request<AdminCsrfResponse>('/admin/auth/csrf'),
  session: () => request<AdminSessionResponse>('/admin/auth/session'),
  login: (password: string, csrfToken: string, returnTo: string) => request<AdminLoginResponse>('/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ password, returnTo }) }),
  logout: (csrfToken: string) => request<{ ok: true }>('/admin/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } }),
};
