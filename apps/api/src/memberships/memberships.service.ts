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

  // 계정 포털 "연동된 앱" 카드 — 비활성 client 는 사용자에게 보이지 않는다.
  async listForUser(userId: string) {
    const r = await this.db.query(
      `SELECT m.client_id, c.name AS client_name, c.theme_color, m.role, m.status, m.last_seen_at
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
      lastSeenAt: (row.last_seen_at as Date | null) ?? null,
    }));
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
