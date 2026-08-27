import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ENV } from '../config/env';
import { REDIS } from '../redis/redis-module';
import type Redis from 'ioredis';

const TTL = () => ENV.sessionTtlSeconds;

export interface SessionMeta {
  ua: string;
  ip: string;
}

@Injectable()
export class SessionService {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  private client(): Redis {
    if (!this.redis) throw new Error('REDIS_URL not configured');
    return this.redis;
  }

  async create(userId: string, meta: SessionMeta): Promise<string> {
    const sid = randomBytes(32).toString('base64url');
    const key = `sess:${sid}`;
    const ttl = TTL();

    await this.client()
      .multi()
      .hset(key, {
        userId,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        ua: meta.ua,
        ip: meta.ip,
      })
      .expire(key, ttl)
      .sadd(`user_sess:${userId}`, sid)
      .expire(`user_sess:${userId}`, ttl)
      .exec();

    return sid;
  }

  async get(sid: string) {
    const h = await this.client().hgetall(`sess:${sid}`);
    return h && h.userId
      ? { userId: h.userId, createdAt: Number(h.createdAt), lastSeenAt: Number(h.lastSeenAt), ua: h.ua, ip: h.ip }
      : null;
  }

  // 계정 포털 "활성 세션" 카드. 만료된 sid 는 집합에 남아 있을 수 있어 걸러낸다.
  async listForUser(userId: string, currentSid?: string) {
    const sids = await this.client().smembers(`user_sess:${userId}`);
    if (sids.length === 0) return [];

    const results = await Promise.all(
      sids.map(async (sid) => {
        const h = await this.client().hgetall(`sess:${sid}`);
        if (!h?.userId) return null;
        return {
          id: sid,
          current: sid === currentSid,
          createdAt: Number(h.createdAt),
          lastSeenAt: Number(h.lastSeenAt),
          ua: h.ua ?? '',
          ip: h.ip ?? '',
        };
      }),
    );

    return results
      .filter((session): session is NonNullable<typeof session> => session !== null)
      .sort((a, b) => (a.current ? -1 : b.current ? 1 : b.lastSeenAt - a.lastSeenAt));
  }

  async touch(sid: string, userId: string) {
    const ttl = TTL();
    await this.client()
      .multi()
      .hset(`sess:${sid}`, 'lastSeenAt', Date.now())
      .expire(`sess:${sid}`, ttl)
      .expire(`user_sess:${userId}`, ttl)
      .exec();
  }

  async revoke(sid: string): Promise<string | null> {
    const h = await this.client().hgetall(`sess:${sid}`);
    const multi = this.client().multi().del(`sess:${sid}`);
    if (h.userId) multi.srem(`user_sess:${h.userId}`, sid);
    await multi.exec();
    return h.userId ?? null;
  }

  async revokeAll(userId: string) {
    const sids = await this.client().smembers(`user_sess:${userId}`);
    if (sids.length === 0) return;
    await this.client().del(...sids.map((s) => `sess:${s}`), `user_sess:${userId}`);
  }
}
