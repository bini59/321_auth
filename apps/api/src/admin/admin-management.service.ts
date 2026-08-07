import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';
import { SessionService } from '../sessions/session.service';

const STATUSES = new Set(['active', 'suspended']);

@Injectable()
export class AdminManagementService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool, private readonly sessions: SessionService) {}

  async listUsers(search: string | undefined, limit: number, offset: number) {
    const q = search?.trim() || null;
    const result = await this.db.query(
      `SELECT u.id, u.email, u.email_verified, u.name, u.avatar_url, u.created_at,
              COUNT(DISTINCT i.provider)::int AS provider_count,
              COUNT(DISTINCT m.client_id)::int AS membership_count
         FROM users u LEFT JOIN identities i ON i.user_id = u.id LEFT JOIN memberships m ON m.user_id = u.id
        WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%' OR u.id::text = $1)
        GROUP BY u.id ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
      [q, limit, offset],
    );
    return result.rows.map((row) => this.userSummary(row));
  }

  async getUser(userId: string) {
    const user = await this.db.query('SELECT id, email, email_verified, name, avatar_url, created_at FROM users WHERE id = $1', [userId]);
    if (!user.rows[0]) throw new NotFoundException('user not found');
    const [identities, memberships] = await Promise.all([
      this.db.query('SELECT provider, provider_user_id, email_at_link, linked_at FROM identities WHERE user_id = $1 ORDER BY linked_at DESC', [userId]),
      this.db.query(
        `SELECT m.client_id, c.name AS client_name, m.role, m.status, m.joined_at, m.last_seen_at
           FROM memberships m JOIN clients c ON c.client_id = m.client_id WHERE m.user_id = $1 ORDER BY m.joined_at DESC`,
        [userId],
      ),
    ]);
    return {
      ...this.userSummary(user.rows[0]),
      identities: identities.rows.map((row) => ({ provider: row.provider, providerUserId: row.provider_user_id, emailAtLink: row.email_at_link, linkedAt: row.linked_at })),
      memberships: memberships.rows.map((row) => ({ clientId: row.client_id, clientName: row.client_name, role: row.role, status: row.status, joinedAt: row.joined_at, lastSeenAt: row.last_seen_at })),
    };
  }

  async updateMembership(userId: string, clientId: string, status?: string) {
    if (status !== undefined && !STATUSES.has(status)) throw new Error('invalid status');
    if (status === undefined) throw new Error('status required');
    const result = await this.db.query(
      `UPDATE memberships SET status = $3
        WHERE user_id = $1 AND client_id = $2 RETURNING client_id, role, status, joined_at, last_seen_at`,
      [userId, clientId, status],
    );
    if (!result.rows[0]) throw new NotFoundException('membership not found');
    const row = result.rows[0];
    return { clientId: row.client_id, role: row.role, status: row.status, joinedAt: row.joined_at, lastSeenAt: row.last_seen_at };
  }

  async listClientMemberships(clientId: string, limit: number, offset: number) {
    const client = await this.db.query('SELECT 1 FROM clients WHERE client_id = $1', [clientId]);
    if (!client.rows[0]) throw new NotFoundException('client not found');

    const result = await this.db.query(
      `SELECT u.id AS user_id, u.email, u.name, m.role, m.status, m.joined_at, m.last_seen_at
         FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE m.client_id = $1
        ORDER BY m.joined_at DESC
        LIMIT $2 OFFSET $3`,
      [clientId, limit, offset],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
      lastSeenAt: row.last_seen_at,
    }));
  }

  async revokeAllSessions(userId: string) {
    const user = await this.db.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (!user.rows[0]) throw new NotFoundException('user not found');
    await this.sessions.revokeAll(userId);
  }

  private userSummary(row: Record<string, unknown>) {
    return { userId: row.id, email: row.email, emailVerified: Boolean(row.email_verified), name: row.name, avatarUrl: row.avatar_url, createdAt: row.created_at, providerCount: Number(row.provider_count ?? 0), membershipCount: Number(row.membership_count ?? 0) };
  }
}
