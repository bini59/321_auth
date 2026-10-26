import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DB_PROVIDER } from '../db/db.module';
import { NOW, type DbPool } from '../db/db';

@Injectable()
export class MembershipsService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async find(userId: string, clientId: string) {
    const r = await this.db.query(
      `SELECT role, CASE WHEN withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE status END AS status, joined_at FROM memberships WHERE user_id = $1 AND client_id = $2`,
      [userId, clientId],
    );
    const row = r.rows[0];
    return row
      ? { role: row.role as string, status: row.status as string, joinedAt: row.joined_at }
      : null;
  }

  // 계정 포털 "연동된 앱" 카드 — 비활성 client 는 사용자에게 보이지 않는다.
  async listForUser(userId: string) {
    const r = await this.db.query(
      `SELECT m.client_id, c.name AS client_name, c.theme_color, m.role, CASE WHEN m.withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE m.status END AS status, m.last_seen_at
       FROM memberships m JOIN clients c ON c.client_id = m.client_id
       WHERE m.user_id = $1 AND c.is_active
       ORDER BY m.last_seen_at DESC NULLS LAST, m.client_id`,
      [userId],
    );
    return r.rows.map((row) => ({
      clientId: row.client_id as string,
      clientName: row.client_name as string,
      themeColor: (row.theme_color as string | null) ?? null,
      role: row.role as string,
      status: row.status as string,
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
    }));
  }

  // 멱등 — PRD §7.10
  async isAdmin(userId: string) {
    const r = await this.db.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND role = 'admin' AND status = 'active' AND withdrawn_at IS NULL LIMIT 1`,
      [userId],
    );
    return r.rows.length > 0;
  }

  async ensure(userId: string, clientId: string) {
    await this.db.query(
      `INSERT INTO memberships (user_id, client_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, clientId],
    );
  }

  // Identity-only state: never provisions and never grants service access.
  async lifecycle(userId: string, clientId: string) {
    const r = await this.db.query(
      `SELECT status, withdrawn_at, lifecycle_version, cleanup_id, cleanup_pending
       FROM memberships WHERE user_id = $1 AND client_id = $2`, [userId, clientId],
    );
    return this.lifecycleView(r.rows[0]);
  }

  private lifecycleView(row?: Record<string, any>) {
    return {
      state: row?.withdrawn_at ? 'withdrawn' : row?.status ?? 'absent',
      version: Number(row?.lifecycle_version ?? 0),
      cleanupId: row?.cleanup_id ?? null,
      cleanupPending: Boolean(row?.cleanup_pending),
    };
  }

  async transition(userId: string, clientId: string, action: 'withdraw' | 'rejoin' | 'ack',
    version: number, cleanupId?: string) {
    const db = await this.db.connect();
    try {
      await db.query('BEGIN IMMEDIATE');
      const result = await db.query(
        'SELECT * FROM memberships WHERE user_id = $1 AND client_id = $2', [userId, clientId],
      );
      const row = result.rows[0];
      const current = Number(row?.lifecycle_version ?? 0);
      if (action === 'withdraw' && row?.withdrawn_at && (version === current || version === current - 1)) {
        await db.query('COMMIT');
        return this.lifecycleView(row);
      }
      if (version !== current) throw new ConflictException('stale membership version');
      if (action === 'withdraw') {
        await db.query(
          `INSERT INTO memberships (user_id, client_id, withdrawn_at, lifecycle_version, cleanup_id, cleanup_pending)
           VALUES ($1, $2, ${NOW}, $3, $4, 1)
           ON CONFLICT (user_id, client_id) DO UPDATE SET withdrawn_at = ${NOW},
             lifecycle_version = excluded.lifecycle_version, cleanup_id = excluded.cleanup_id, cleanup_pending = 1`,
          [userId, clientId, current + 1, randomUUID()],
        );
      } else if (action === 'ack') {
        if (!row?.withdrawn_at || !cleanupId || row.cleanup_id !== cleanupId) {
          throw new ConflictException('cleanup does not match current withdrawal');
        }
        await db.query('UPDATE memberships SET cleanup_pending = 0 WHERE user_id = $1 AND client_id = $2', [userId, clientId]);
      } else {
        if (!row?.withdrawn_at) throw new ConflictException('membership is not withdrawn');
        if (row.status !== 'active') throw new ForbiddenException('membership restricted');
        if (row.cleanup_pending) throw new ConflictException('cleanup pending');
        await db.query(
          `UPDATE memberships SET withdrawn_at = NULL, cleanup_id = NULL, lifecycle_version = lifecycle_version + 1,
             joined_at = ${NOW}, last_seen_at = NULL WHERE user_id = $1 AND client_id = $2`, [userId, clientId],
        );
      }
      const updated = await db.query('SELECT * FROM memberships WHERE user_id = $1 AND client_id = $2', [userId, clientId]);
      await db.query('COMMIT');
      return this.lifecycleView(updated.rows[0]);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async touch(userId: string, clientId: string) {
    await this.db.query(
      `UPDATE memberships SET last_seen_at = ${NOW} WHERE user_id = $1 AND client_id = $2`,
      [userId, clientId],
    );
  }
}
