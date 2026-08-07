import { Inject, Injectable } from '@nestjs/common';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';

@Injectable()
export class AdminAuditService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async record(input: { action: string; userId?: string; clientId?: string; details?: Record<string, unknown> }) {
    await this.db.query(
      `INSERT INTO admin_audit_log (action, target_user_id, target_client_id, details)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [input.action, input.userId ?? null, input.clientId ?? null, JSON.stringify(input.details ?? {})],
    );
  }

  async recent(limit: number) {
    const result = await this.db.query(
      `SELECT id, action, target_user_id, target_client_id, details, created_at
         FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({ id: row.id, action: row.action, userId: row.target_user_id, clientId: row.target_client_id, details: row.details, createdAt: row.created_at }));
  }
}
