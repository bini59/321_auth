import { Inject, Injectable } from '@nestjs/common';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';

@Injectable()
export class MembershipsService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async find(userId: string, clientId: string) {
    const r = await this.db.query(
      `SELECT role, status, joined_at FROM memberships WHERE user_id = $1 AND client_id = $2`,
      [userId, clientId],
    );
    const row = r.rows[0];
    return row
      ? { role: row.role as string, status: row.status as string, joinedAt: row.joined_at }
      : null;
  }

  // 멱등 — PRD §7.10
  async ensure(userId: string, clientId: string) {
    await this.db.query(
      `INSERT INTO memberships (user_id, client_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, clientId],
    );
  }

  async touch(userId: string, clientId: string) {
    await this.db.query(
      `UPDATE memberships SET last_seen_at = now() WHERE user_id = $1 AND client_id = $2`,
      [userId, clientId],
    );
  }
}
