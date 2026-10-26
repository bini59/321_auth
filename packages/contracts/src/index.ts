export interface Membership { role: string; status: string; joinedAt: string; }
export interface AuthenticatedUser { userId: string; email: string | null; emailVerified: boolean; name: string | null; avatarUrl: string | null; membership: Membership | null; }
export interface HealthResponse { ok: boolean; }

/** Identity verification only; never use this response to authorize service access. */
export interface MembershipLifecycle {
  userId: string;
  clientId: string;
  state: 'absent' | 'active' | 'suspended' | 'withdrawn';
  version: number;
  cleanupId: string | null;
  cleanupPending: boolean;
}
export interface MembershipIdentity extends MembershipLifecycle { purpose: 'membership-lifecycle'; }
export interface MembershipTransitionRequest { clientId: string; version: number; }
export interface MembershipRejoinRequest extends MembershipTransitionRequest { consent: true; }
export interface MembershipCleanupAckRequest extends MembershipTransitionRequest { cleanupId: string; }
