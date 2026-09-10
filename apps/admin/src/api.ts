import type { AuthenticatedUser, HealthResponse } from '@321-auth/contracts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== '/admin/login') {
      window.location.replace(`/admin/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
    }
    throw new Error(`Auth API request failed (${response.status})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`Auth API returned non-JSON response (${contentType || 'unknown content type'})`);
  }

  return response.json() as Promise<T>;
}

function mutate<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', csrfToken: string, ...body: [] | [unknown]): Promise<T> {
  const headers: Record<string, string> = { 'x-csrf-token': csrfToken };
  const init: RequestInit = { method, headers };
  if (body.length) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body[0]);
  }
  return request<T>(path, init);
}

export interface AdminSessionResponse { authenticated: true }
export interface AdminCsrfResponse { csrfToken: string }
export interface AdminLoginResponse { ok: true; returnTo: string }
export interface AdminService { client_id: string; service_id?: string; serviceId?: string; name: string; service_name?: string; serviceName?: string; allowed_origins: string[]; default_redirect: string; auto_provision: boolean; onboarding_path: string | null; is_active: boolean; logo_url: string | null; theme_color: string | null; membership_count?: number }
/** @deprecated Use AdminService. */
export type AdminClient = AdminService;
export interface AdminServiceSecretResponse { service: AdminService; client: AdminService; secret: string }
/** @deprecated Use AdminServiceSecretResponse. */
export type AdminClientSecretResponse = AdminServiceSecretResponse;
export interface AdminUser { userId: string; email: string | null; emailVerified: boolean; name: string | null; avatarUrl: string | null; createdAt: string; providerCount: number; membershipCount: number }
export interface AdminMembership { clientId: string; clientName: string; role: string; status: string; joinedAt: string; lastSeenAt: string | null }
export interface AdminServiceMembership { userId: string; email: string | null; name: string | null; role: string; status: string; joinedAt: string; lastSeenAt: string | null }
export interface AdminUserDetail extends AdminUser { identities: Array<{ provider: string; providerUserId: string; emailAtLink: string | null; linkedAt: string }>; memberships: AdminMembership[] }
export interface AdminAudit { id: number; action: string; userId: string | null; clientId: string | null; details: Record<string, unknown>; createdAt: string }
export interface AdminOverview {
  counts: {
    users: number | null;
    activeSessions: number | null;
    clients: number | null;
    memberships: number | null;
    suspendedMemberships: number | null;
    deletionRequests: number | null;
  };
  services: { api: 'up'; postgres: 'up' | 'down'; redis: 'up' | 'down' };
}
export interface DeletionQueueItem { userId: string; requestedAt: string }
export const authApi = {
  health: () => request<HealthResponse>('/healthz'),
  currentUser: () => request<AuthenticatedUser>('/me'),
  csrf: () => request<AdminCsrfResponse>('/admin/auth/csrf'),
  adminLogin: (provider: 'google' | 'kakao', returnTo: string) => { window.location.assign(`/admin/auth/login/${provider}?return_to=${encodeURIComponent(returnTo)}`); },
  session: () => request<AdminSessionResponse>('/admin/auth/session'),
  login: (password: string, csrfToken: string, returnTo: string) => mutate<AdminLoginResponse>('/admin/auth/login', 'POST', csrfToken, { password, returnTo }),
  logout: (csrfToken: string) => mutate<{ ok: true }>('/admin/auth/logout', 'POST', csrfToken),
  services: () => request<AdminService[]>('/admin/services'),
  createService: (body: unknown, csrfToken: string) => mutate<AdminServiceSecretResponse>('/admin/services', 'POST', csrfToken, body),
  updateService: (id: string, body: unknown, csrfToken: string) => mutate<AdminService>(`/admin/services/${encodeURIComponent(id)}`, 'PATCH', csrfToken, body),
  setServiceActive: (id: string, active: boolean, csrfToken: string) => mutate<AdminService>(`/admin/services/${encodeURIComponent(id)}${active ? '/activate' : ''}`, active ? 'POST' : 'DELETE', csrfToken),
  rotateServiceSecret: (id: string, csrfToken: string) => mutate<{ service_id: string; client_id: string; secret: string }>(`/admin/services/${encodeURIComponent(id)}/rotate-secret`, 'POST', csrfToken),
  /** @deprecated Compatibility aliases for existing Admin callers. */
  clients: () => authApi.services(),
  createClient: (body: unknown, csrfToken: string) => authApi.createService(body, csrfToken),
  updateClient: (id: string, body: unknown, csrfToken: string) => authApi.updateService(id, body, csrfToken),
  setClientActive: (id: string, active: boolean, csrfToken: string) => authApi.setServiceActive(id, active, csrfToken),
  rotateClientSecret: (id: string, csrfToken: string) => authApi.rotateServiceSecret(id, csrfToken),
  users: (search = '') => request<AdminUser[]>(`/admin/api/users?search=${encodeURIComponent(search)}`),
  user: (userId: string) => request<AdminUserDetail>(`/admin/api/users/${encodeURIComponent(userId)}`),
  memberships: (clientId: string, limit = 50, offset = 0) => request<AdminServiceMembership[]>(`/admin/api/clients/${encodeURIComponent(clientId)}/memberships?limit=${limit}&offset=${offset}`),
  updateMembership: (userId: string, clientId: string, csrfToken: string, update: { role?: string; status?: string }) => mutate<AdminMembership>(`/admin/api/users/${encodeURIComponent(userId)}/memberships/${encodeURIComponent(clientId)}`, 'PATCH', csrfToken, update),
  revokeSessions: (userId: string, csrfToken: string) => mutate<{ ok: true }>(`/admin/api/users/${encodeURIComponent(userId)}/revoke-sessions`, 'POST', csrfToken),
  audit: () => request<AdminAudit[]>('/admin/api/audit'),
  overview: () => request<AdminOverview>('/admin/api/overview'),
  deletionQueue: () => request<DeletionQueueItem[]>('/admin/api/deletion-queue'),
};
