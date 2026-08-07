import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';
import { REDIS } from '../redis/redis-module';

export interface AdminOverview {
  counts: {
    users: number | null;
    activeSessions: number | null;
    clients: number | null;
    memberships: number | null;
    deletionRequests: number | null;
  };
  services: {
    api: 'up';
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
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
    @Inject(REDIS) private readonly redis: Redis | null,
  ) {}

  async overview(): Promise<AdminOverview> {
    const [users, clients, memberships, deletionRequests, postgres, redis] = await Promise.all([
      this.count('SELECT count(*)::int AS count FROM users'),
      this.count('SELECT count(*)::int AS count FROM clients'),
      this.count('SELECT count(*)::int AS count FROM memberships'),
      this.count('SELECT count(*)::int AS count FROM deletion_queue'),
      this.postgresStatus(),
      this.redisStatus(),
    ]);

    return {
      counts: {
        users,
        activeSessions: redis.activeSessions,
        clients,
        memberships,
        deletionRequests,
      },
      services: {
        api: 'up',
        postgres: postgres ? 'up' : 'down',
        redis: redis.status,
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

  private async postgresStatus(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async redisStatus(): Promise<{ status: 'up' | 'down'; activeSessions: number | null }> {
    if (!this.redis) return { status: 'down', activeSessions: null };
    try {
      await this.redis.ping();
      return { status: 'up', activeSessions: await this.countUserSessions() };
    } catch {
      return { status: 'down', activeSessions: null };
    }
  }

  private async countUserSessions(): Promise<number> {
    let cursor = '0';
    let count = 0;
    do {
      const [nextCursor, keys] = await this.redis!.scan(cursor, 'MATCH', 'sess:*', 'COUNT', 1000);
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  }
}
