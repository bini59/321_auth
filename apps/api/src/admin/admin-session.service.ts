import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ENV } from '../config/env';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';

// 관리자 세션은 만들 때 정한 만료 시각까지만 유효하다 (사용해도 연장하지 않음).
@Injectable()
export class AdminSessionService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async create(meta: { ua: string; ip: string; userId: string }): Promise<string> {
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    await this.db.query('DELETE FROM admin_sessions WHERE expires_at <= $1', [now]);
    await this.db.query(
      'INSERT INTO admin_sessions (sid, user_id, created_at, expires_at, ua, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [sid, meta.userId, now, now + ENV.adminSessionTtlSeconds * 1000, meta.ua ?? '', meta.ip ?? ''],
    );
    return sid;
  }

  async exists(sid: string): Promise<boolean> {
    return (await this.userId(sid)) !== null;
  }

  async userId(sid: string): Promise<string | null> {
    const r = await this.db.query('SELECT user_id FROM admin_sessions WHERE sid = $1 AND expires_at > $2', [sid, Date.now()]);
    return (r.rows[0]?.user_id as string | undefined) || null;
  }

  async revoke(sid: string): Promise<void> {
    await this.db.query('DELETE FROM admin_sessions WHERE sid = $1', [sid]);
  }
}
