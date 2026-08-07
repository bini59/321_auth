import type { AuthenticatedUser, HealthResponse } from '@321-auth/contracts';
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { credentials: 'include', ...init }); if (!response.ok) throw new Error(`Auth API request failed (${response.status})`); return response.json() as Promise<T>; }
export interface AdminSessionResponse { authenticated: true }
export interface AdminCsrfResponse { csrfToken: string }
export interface AdminLoginResponse { ok: true; returnTo: string }
export interface AdminUser { userId: string; email: string | null; emailVerified: boolean; name: string | null; avatarUrl: string | null; createdAt: string; providerCount: number; membershipCount: number }
export interface AdminMembership { clientId: string; clientName: string; role: string; status: string; joinedAt: string; lastSeenAt: string | null }
export interface AdminUserDetail extends AdminUser { identities: Array<{ provider: string; providerUserId: string; emailAtLink: string | null; linkedAt: string }>; memberships: AdminMembership[] }
export interface AdminAudit { id: number; action: string; userId: string | null; clientId: string | null; details: Record<string, unknown>; createdAt: string }
export const authApi = {
  health: () => request<HealthResponse>('/healthz'),
  currentUser: () => request<AuthenticatedUser>('/me'),
  csrf: () => request<AdminCsrfResponse>('/admin/auth/csrf'),
  session: () => request<AdminSessionResponse>('/admin/auth/session'),
  login: (password: string, csrfToken: string, returnTo: string) => request<AdminLoginResponse>('/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ password, returnTo }) }),
  logout: (csrfToken: string) => request<{ ok: true }>('/admin/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } }),
  users: (search = '') => request<AdminUser[]>(`/admin/api/users?search=${encodeURIComponent(search)}`),
  user: (userId: string) => request<AdminUserDetail>(`/admin/api/users/${encodeURIComponent(userId)}`),
  updateMembership: (userId: string, clientId: string, csrfToken: string, update: { role?: string; status?: string }) => request<AdminMembership>(`/admin/api/users/${encodeURIComponent(userId)}/memberships/${encodeURIComponent(clientId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(update) }),
  revokeSessions: (userId: string, csrfToken: string) => request<{ ok: true }>(`/admin/api/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } }),
  audit: () => request<AdminAudit[]>('/admin/api/audit'),
};
