import { Inject, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DB_PROVIDER } from '../db/db.module';
import type { DbPool } from '../db/db';
import type { ClientInfo } from '../oidc/return-to';

export interface ClientRow extends ClientInfo {
  client_id: string;
  name: string;
  logo_url: string | null;
  theme_color: string | null;
  allowed_origins: string[];
  default_redirect: string;
  auto_provision: boolean;
  onboarding_path: string | null;
  secret_hash: string;
  is_active: boolean;
  membership_count?: number;
}

export function hashAppSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

@Injectable()
export class ClientsService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DbPool) {}

  async find(clientId: string): Promise<ClientRow | null> {
    const r = await this.db.query(
      `SELECT * FROM clients WHERE client_id = $1`,
      [clientId],
    );
    return r.rows[0] ?? null;
  }

  async list(): Promise<Array<Omit<ClientRow, 'secret_hash'>>> {
    const r = await this.db.query(
      `SELECT c.client_id, c.name, c.logo_url, c.theme_color, c.allowed_origins, c.default_redirect,
              c.auto_provision, c.onboarding_path, c.is_active, c.created_at,
              COUNT(m.user_id)::int AS membership_count
       FROM clients c LEFT JOIN memberships m ON m.client_id = c.client_id
       GROUP BY c.client_id ORDER BY c.client_id`,
    );
    return r.rows;
  }

  async update(clientId: string, input: { name: string; allowed_origins: string[]; default_redirect: string; auto_provision: boolean; onboarding_path: string | null; logo_url?: string | null; theme_color?: string | null }) {
    const r = await this.db.query(
      `UPDATE clients SET name=$2, allowed_origins=$3::text[], default_redirect=$4,
         auto_provision=$5, onboarding_path=$6, logo_url=$7, theme_color=$8
       WHERE client_id=$1 RETURNING client_id, name, logo_url, theme_color, allowed_origins,
         default_redirect, auto_provision, onboarding_path, is_active, created_at`,
      [clientId, input.name, input.allowed_origins, input.default_redirect, input.auto_provision, input.onboarding_path, input.logo_url ?? null, input.theme_color ?? null],
    );
    return r.rows[0] ?? null;
  }

  async setActive(clientId: string, isActive: boolean) {
    const r = await this.db.query(
      `UPDATE clients SET is_active=$2 WHERE client_id=$1 RETURNING client_id, is_active`,
      [clientId, isActive],
    );
    return r.rows[0] ?? null;
  }

  async rotateSecret(clientId: string, secretHash: string) {
    const r = await this.db.query(
      `UPDATE clients SET secret_hash=$2 WHERE client_id=$1 RETURNING client_id`,
      [clientId, secretHash],
    );
    return r.rowCount ? r.rows[0] : null;
  }

  async verifySecret(clientId: string, secret: string): Promise<ClientRow | null> {
    const client = await this.find(clientId);
    if (!client) return null;
    const got = Buffer.from(hashAppSecret(secret), 'hex');
    const want = Buffer.from(client.secret_hash, 'hex');
    const equal =
      got.length === want.length && timingSafeEqual(got, want);
    return equal ? client : null;
  }

  async create(input: {
    client_id: string;
    name: string;
    allowed_origins: string[];
    default_redirect: string;
    auto_provision: boolean;
    secret_hash: string;
    logo_url?: string | null;
    theme_color?: string | null;
    onboarding_path?: string | null;
  }) {
    return this.db.query(
      `INSERT INTO clients
         (client_id, name, logo_url, theme_color, allowed_origins, default_redirect,
          auto_provision, onboarding_path, secret_hash)
       VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9)
       ON CONFLICT (client_id) DO NOTHING`,
      [
        input.client_id,
        input.name,
        input.logo_url ?? null,
        input.theme_color ?? null,
        input.allowed_origins,
        input.default_redirect,
        input.auto_provision,
        input.onboarding_path ?? null,
        input.secret_hash,
      ],
    );
  }
}
