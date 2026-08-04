import type { AuthenticatedUser, HealthResponse } from '@321-auth/contracts';
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { credentials: 'include', ...init }); if (!response.ok) throw new Error(`Auth API request failed (${response.status})`); return response.json() as Promise<T>; }
export const authApi = { health: () => request<HealthResponse>('/healthz'), currentUser: () => request<AuthenticatedUser>('/me') };
