import { describe, expect, it, vi } from 'vitest';
import { AdminDashboardService } from './admin-dashboard.service';

function dbForCounts() {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM users')) return { rows: [{ count: 12 }] };
      if (sql.includes('FROM clients')) return { rows: [{ count: 3 }] };
      if (sql.includes('FROM memberships')) return { rows: [{ count: 21 }] };
      if (sql.includes('FROM deletion_queue')) return { rows: [{ count: 2 }] };
      throw new Error('unexpected query');
    }),
  };
}

describe('AdminDashboardService', () => {
  it('returns database counts, user sessions, and dependency health without secrets', async () => {
    const db = dbForCounts();
    const redis = { ping: vi.fn(async () => 'PONG'), scan: vi.fn(async () => ['0', ['sess:a', 'sess:b']]) };
    const result = await new AdminDashboardService(db as any, redis as any).overview();
    expect(result).toEqual({
      counts: { users: 12, activeSessions: 2, clients: 3, memberships: 21, deletionRequests: 2 },
      services: { api: 'up', postgres: 'up', redis: 'up' },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|password|hash|admin_sid/i);
  });

  it('fails closed for dependency status while retaining a usable response', async () => {
    const db = { query: vi.fn(async () => { throw new Error('database down'); }) };
    const redis = { ping: vi.fn(async () => { throw new Error('redis down'); }) };
    const result = await new AdminDashboardService(db as any, redis as any).overview();
    expect(result.counts).toEqual({ users: null, activeSessions: null, clients: null, memberships: null, deletionRequests: null });
    expect(result.services).toEqual({ api: 'up', postgres: 'down', redis: 'down' });
  });

  it('returns the newest deletion requests with bounded output', async () => {
    const db = {
      query: vi.fn(async (sql: string) => sql.includes('deletion_queue') && sql.includes('ORDER BY')
        ? { rows: [{ user_id: 'u-1', requested_at: '2026-08-07T00:00:00.000Z' }] }
        : { rows: [{ count: 0 }] }),
    };
    await expect(new AdminDashboardService(db as any, null).deletionQueue()).resolves.toEqual([
      { userId: 'u-1', requestedAt: '2026-08-07T00:00:00.000Z' },
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 100'));
  });
});
