import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { ENV } from '../config/env';
import { REDIS } from '../redis/redis-module';

const key = (sid: string) => `admin_sess:${sid}`;

@Injectable()
export class AdminSessionService {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  private client(): Redis {
    if (!this.redis) throw new Error('REDIS_URL not configured');
    return this.redis;
  }

  async create(meta: { ua: string; ip: string }): Promise<string> {
    const sid = randomBytes(32).toString('base64url');
    await this.client().hset(key(sid), { createdAt: Date.now(), ua: meta.ua, ip: meta.ip });
    await this.client().expire(key(sid), ENV.adminSessionTtlSeconds);
    return sid;
  }

  async exists(sid: string): Promise<boolean> {
    return (await this.client().exists(key(sid))) === 1;
  }

  async revoke(sid: string): Promise<void> {
    await this.client().del(key(sid));
  }
}

