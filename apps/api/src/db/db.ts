import { Pool } from 'pg';
import { ENV } from '../config/env';

export const pool = new Pool({
  connectionString: ENV.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
});

export type DbPool = Pool;
