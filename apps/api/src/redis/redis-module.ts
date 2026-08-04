import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/env';

export const REDIS = 'REDIS';

export const redisProvider = {
  provide: REDIS,
  useFactory: () => {
    if (!ENV.redisUrl) return null;
    return new Redis(ENV.redisUrl, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
  },
};

@Module({
  providers: [redisProvider],
  exports: [REDIS],
})
export class RedisModule {}
