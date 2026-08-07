import type { AuthenticatedUser, HealthResponse } from '@321-auth/contracts';
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { credentials: 'include', ...init }); if (!response.ok) throw new Error(`Auth API request failed (${response.status})`); return response.json() as Promise<T>; }
export interface AdminSessionResponse { authenticated: true }
export interface AdminCsrfResponse { csrfToken: string }
export interface AdminLoginResponse { ok: true; returnTo: string }
export interface AdminClient { client_id: string; name: string; allowed_origins: string[]; default_redirect: string; auto_provision: boolean; onboarding_path: string | null; is_active: boolean; logo_url: string | null; theme_color: string | null }
export interface AdminClientSecretResponse { client: AdminClient; secret: string }
export interface AdminUser { userId: string; email: string | null; emailVerified: boolean; name: string | null; avatarUrl: string | null; createdAt: string; providerCount: number; membershipCount: number }
export interface AdminMembership { clientId: string; clientName: string; role: string; status: string; joinedAt: string; lastSeenAt: string | null }
export interface AdminUserDetail extends AdminUser { identities: Array<{ provider: string; providerUserId: string; emailAtLink: string | null; linkedAt: string }>; memberships: AdminMembership[] }
export interface AdminAudit { id: number; action: string; userId: string | null; clientId: string | null; details: Record<string, unknown>; createdAt: string }
export interface AdminOverview { userCount: number | null; clientCount: number | null; activeMembershipCount: number | null; suspendedMembershipCount: number | null; services: { postgres: 'up' | 'down'; redis: 'up' | 'down' } }
export interface DeletionQueueItem { userId: string; requestedAt: string }
export const authApi = {
  health: () => request<HealthResponse>('/healthz'),
  currentUser: () => request<AuthenticatedUser>('/me'),
  csrf: () => request<AdminCsrfResponse>('/admin/auth/csrf'),
  session: () => request<AdminSessionResponse>('/admin/auth/session'),
  login: (password: string, csrfToken: string, returnTo: string) => request<AdminLoginResponse>('/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ password, returnTo }) }),
  logout: (csrfToken: string) => request<{ ok: true }>('/admin/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } }),
  clients: () => request<AdminClient[]>('/admin/clients'),
  createClient: (body: unknown, csrfToken: string) => request<AdminClientSecretResponse>('/admin/clients', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) }),
  updateClient: (id: string, body: unknown, csrfToken: string) => request<AdminClient>(`/admin/clients/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) }),
  setClientActive: (id: string, active: boolean, csrfToken: string) => request<AdminClient>(`/admin/clients/${encodeURIComponent(id)}${active ? '/activate' : ''}`, { method: active ? 'POST' : 'DELETE', headers: { 'x-csrf-token': csrfToken } }),
  rotateClientSecret: (id: string, csrfToken: string) => request<{ client_id: string; secret: string }>(`/admin/clients/${encodeURIComponent(id)}/rotate-secret`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } }),
  users: (search = '') => request<AdminUser[]>(`/admin/api/users?search=${encodeURIComponent(search)}`),
  user: (userId: string) => request<AdminUserDetail>(`/admin/api/users/${encodeURIComponent(userId)}`),
  updateMembership: (userId: string, clientId: string, csrfToken: string, update: { role?: string; status?: string }) => request<AdminMembership>(`/admin/api/users/${encodeURIComponent(userId)}/memberships/${encodeURIComponent(clientId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(update) }),
  revokeSessions: (userId: string, csrfToken: string) => request<{ ok: true }>(`/admin/api/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } }),
  audit: () => request<AdminAudit[]>('/admin/api/audit'),
  overview: () => request<AdminOverview>('/admin/api/overview'),
  deletionQueue: () => request<DeletionQueueItem[]>('/admin/api/deletion-queue'),
};
