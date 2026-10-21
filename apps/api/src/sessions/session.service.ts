import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ENV } from '../config/env';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool, Row } from '../db/db';

const TTL_MS = () => ENV.sessionTtlSeconds * 1000;

export interface SessionMeta {
  ua: string;
  ip: string;
}

// 세션은 SQLite sessions 테이블에 둔다. 만료는 마지막 사용 시각 기준으로 밀린다 (Redis EXPIRE 와 같은 의미).
@Injectable()
export class SessionService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async create(userId: string, meta: SessionMeta): Promise<string> {
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    await this.db.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
    await this.db.query(
      `INSERT INTO sessions (sid, user_id, created_at, last_seen_at, expires_at, ua, ip)
       VALUES ($1, $2, $3, $3, $4, $5, $6)`,
      [sid, userId, now, now + TTL_MS(), meta.ua ?? '', meta.ip ?? ''],
    );
    return sid;
  }

  async get(sid: string) {
    const r = await this.db.query(
      'SELECT user_id, created_at, last_seen_at, ua, ip FROM sessions WHERE sid = $1 AND expires_at > $2',
      [sid, Date.now()],
    );
    const row = r.rows[0];
    return row
      ? { userId: String(row.user_id), createdAt: Number(row.created_at), lastSeenAt: Number(row.last_seen_at), ua: row.ua as string, ip: row.ip as string }
      : null;
  }

  // 계정 포털 "활성 세션" 카드. 만료된 세션은 제외한다.
  async listForUser(userId: string, currentSid?: string) {
    const r = await this.db.query(
      'SELECT sid, created_at, last_seen_at, ua, ip FROM sessions WHERE user_id = $1 AND expires_at > $2',
      [userId, Date.now()],
    );
    return r.rows
      .map((row: Row) => ({
        id: String(row.sid),
        current: row.sid === currentSid,
        createdAt: Number(row.created_at),
        lastSeenAt: Number(row.last_seen_at),
        ua: (row.ua as string) ?? '',
        ip: (row.ip as string) ?? '',
      }))
      .sort((a, b) => (a.current ? -1 : b.current ? 1 : b.lastSeenAt - a.lastSeenAt));
  }

  async touch(sid: string, _userId: string) {
    const now = Date.now();
    await this.db.query(
      'UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE sid = $1 AND expires_at > $2',
      [sid, now, now + TTL_MS()],
    );
  }

  async revoke(sid: string): Promise<string | null> {
    const r = await this.db.query('DELETE FROM sessions WHERE sid = $1 RETURNING user_id', [sid]);
    return (r.rows[0]?.user_id as string | undefined) ?? null;
  }

  async revokeAll(userId: string) {
    await this.db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  async countActive(): Promise<number> {
    const r = await this.db.query('SELECT count(*) AS count FROM sessions WHERE expires_at > $1', [Date.now()]);
    return Number(r.rows[0]?.count ?? 0);
  }
}
