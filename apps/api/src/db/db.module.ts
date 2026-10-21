import { Module } from '@nestjs/common';
import { pool } from './db';

export const DB_PROVIDER = 'DB';

@Module({
  providers: [{ provide: DB_PROVIDER, useValue: pool }],
  exports: [DB_PROVIDER],
})
export class DbModule {}
