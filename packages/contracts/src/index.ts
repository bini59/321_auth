export interface Membership { role: string; status: string; joinedAt: string; }
export interface AuthenticatedUser { userId: string; email: string | null; name: string | null; avatarUrl: string | null; membership: Membership | null; }
export interface HealthResponse { ok: boolean; }
