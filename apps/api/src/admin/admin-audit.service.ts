import { Inject, Injectable } from '@nestjs/common';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';

@Injectable()
export class AdminAuditService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async record(input: { action: string; userId?: string; clientId?: string; details?: Record<string, unknown> }) {
    await this.db.query(
      `INSERT INTO admin_audit_log (action, target_user_id, target_client_id, details)
       VALUES ($1, $2, $3, $4)`,
      [input.action, input.userId ?? null, input.clientId ?? null, JSON.stringify(input.details ?? {})],
    );
  }

  async recent(limit: number) {
    const result = await this.db.query(
      `SELECT id, action, target_user_id, target_client_id, details, created_at
         FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    // id 는 Postgres BIGSERIAL 시절처럼 문자열로, details 는 JSON 텍스트를 객체로 돌려준다.
    return result.rows.map((row) => ({ id: String(row.id), action: row.action, userId: row.target_user_id, clientId: row.target_client_id, details: JSON.parse(row.details), createdAt: row.created_at }));
  }
}
