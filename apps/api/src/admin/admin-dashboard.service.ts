import { Injectable, Inject } from '@nestjs/common';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';
import { SessionService } from '../sessions/session.service';

export interface AdminOverview {
  counts: {
    users: number | null;
    activeSessions: number | null;
    clients: number | null;
    memberships: number | null;
    suspendedMemberships: number | null;
    deletionRequests: number | null;
  };
  services: {
    api: 'up';
    database: 'up' | 'down';
  };
}

export interface DeletionQueueItem {
  userId: string;
  requestedAt: string;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(DB_PROVIDER) private readonly db: DbPool,
    private readonly sessions: SessionService,
  ) {}

  async overview(): Promise<AdminOverview> {
    const [users, clients, memberships, suspendedMemberships, deletionRequests, activeSessions, database] = await Promise.all([
      this.count('SELECT count(*) AS count FROM users'),
      this.count('SELECT count(*) AS count FROM clients'),
      this.count("SELECT count(*) AS count FROM memberships WHERE status = 'active'"),
      this.count("SELECT count(*) AS count FROM memberships WHERE status = 'suspended'"),
      this.count('SELECT count(*) AS count FROM deletion_queue'),
      this.sessions.countActive().catch(() => null),
      this.databaseStatus(),
    ]);

    return {
      counts: {
        users,
        activeSessions,
        clients,
        memberships,
        suspendedMemberships,
        deletionRequests,
      },
      services: {
        api: 'up',
        database: database ? 'up' : 'down',
      },
    };
  }

  async deletionQueue(): Promise<DeletionQueueItem[]> {
    const result = await this.db.query(
      `SELECT user_id, requested_at
         FROM deletion_queue
        ORDER BY requested_at DESC
        LIMIT 100`,
    );
    return result.rows.map((row) => ({
      userId: String(row.user_id),
      requestedAt: new Date(row.requested_at).toISOString(),
    }));
  }

  private async count(sql: string): Promise<number | null> {
    try {
      const result = await this.db.query(sql);
      return Number(result.rows[0]?.count ?? 0);
    } catch {
      return null;
    }
  }

  private async databaseStatus(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
