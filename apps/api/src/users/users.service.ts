import { Inject, Injectable } from '@nestjs/common';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';
import type { NormalizedIdentity } from '../oidc/oidc.service';

@Injectable()
export class UsersService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async findById(userId: string) {
    const r = await this.db.query(
      `SELECT id, email, email_verified, name, avatar_url, created_at FROM users WHERE id = $1`,
      [userId],
    );
    if (!r.rows[0]) return null;
    const u = r.rows[0];
    return { ...u, email_verified: Boolean(u.email_verified) };
  }

  // PRD §10 — 로그인 상태에서 프로바이더 연결. 병합은 금지.
  async linkIdentity(existingUserId: string, id: NormalizedIdentity): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT user_id FROM identities WHERE provider = $1 AND provider_user_id = $2 FOR UPDATE`,
        [id.provider, id.providerUserId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].user_id !== existingUserId) {
          throw new Error('identity already linked to another user — 병합 금지');
        }
        // 이미 같은 유저에 연결됨 → 무해(idempotent)
        await client.query('COMMIT');
        return;
      }
      await client.query(
        `INSERT INTO identities (provider, provider_user_id, user_id, email_at_link)
         VALUES ($1, $2, $3, $4)`,
        [id.provider, id.providerUserId, existingUserId, id.email],
      );
      if (id.name || id.avatarUrl || (id.emailVerified && id.email)) {
        await client.query(
          `UPDATE users SET
             name = COALESCE($2, name),
             avatar_url = COALESCE($3, avatar_url),
             email = CASE WHEN $4 THEN COALESCE($5, email) ELSE email END
           WHERE id = $1`,
          [existingUserId, id.name, id.avatarUrl, id.emailVerified, id.email],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // PRD §7.7 — 트랜잭션 + FOR UPDATE 로 동시 로그인 중복 생성 방지.
  async upsertFromProvider(id: NormalizedIdentity): Promise<string> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT user_id FROM identities
          WHERE provider = $1 AND provider_user_id = $2
          FOR UPDATE`,
        [id.provider, id.providerUserId],
      );

      if (existing.rows[0]) {
        const userId = existing.rows[0].user_id;
        await client.query(
          `UPDATE users SET
             name = COALESCE($2, name),
             avatar_url = COALESCE($3, avatar_url),
             email = CASE WHEN $4 THEN COALESCE($5, email) ELSE email END,
             email_verified = email_verified OR $4
           WHERE id = $1`,
          [userId, id.name, id.avatarUrl, id.emailVerified, id.email],
        );
        await client.query('COMMIT');
        return userId;
      }

      // 이메일이 이미 다른 유저에 있으면 자동 병합하지 않고 NULL로 생성
      const taken =
        id.email != null &&
        ((await client.query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [id.email]))
          .rowCount ?? 0) > 0;

      const inserted = await client.query(
        `INSERT INTO users (email, email_verified, name, avatar_url)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [taken ? null : id.email, !taken && id.emailVerified, id.name, id.avatarUrl],
      );
      const userId = inserted.rows[0].id as string;

      await client.query(
        `INSERT INTO identities (provider, provider_user_id, user_id, email_at_link)
         VALUES ($1, $2, $3, $4)`,
        [id.provider, id.providerUserId, userId, id.email],
      );

      await client.query('COMMIT');
      return userId;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
