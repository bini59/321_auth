import type { AuthenticatedUser, HealthResponse } from '@321-auth/contracts';
const apiOrigin = import.meta.env.VITE_AUTH_API_ORIGIN ?? '';
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${apiOrigin}${path}`, { credentials: 'include', ...init }); if (!response.ok) throw new Error(`Auth API request failed (${response.status})`); return response.json() as Promise<T>; }
export const authApi = { health: () => request<HealthResponse>('/healthz'), currentUser: () => request<AuthenticatedUser>('/me') };
