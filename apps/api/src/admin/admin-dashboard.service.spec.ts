import { describe, expect, it, vi } from 'vitest';
import { AdminDashboardService } from './admin-dashboard.service';

function dbForCounts() {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT 1')) return { rows: [{ 1: 1 }] };
      if (sql.includes('FROM users')) return { rows: [{ count: 12 }] };
      if (sql.includes('FROM clients')) return { rows: [{ count: 3 }] };
      if (sql.includes("FROM memberships") && sql.includes("status = 'suspended'")) return { rows: [{ count: 4 }] };
      if (sql.includes("FROM memberships") && sql.includes("status = 'active'")) return { rows: [{ count: 21 }] };
      if (sql.includes('FROM deletion_queue')) return { rows: [{ count: 2 }] };
      throw new Error('unexpected query');
    }),
  };
}

describe('AdminDashboardService', () => {
  it('returns database counts, user sessions, and dependency health without secrets', async () => {
    const db = dbForCounts();
    const sessions = { countActive: vi.fn(async () => 2) };
    const result = await new AdminDashboardService(db as any, sessions as any).overview();
    expect(result).toEqual({
      counts: { users: 12, activeSessions: 2, clients: 3, memberships: 21, suspendedMemberships: 4, deletionRequests: 2 },
      services: { api: 'up', database: 'up' },
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"));
    expect(JSON.stringify(result)).not.toMatch(/secret|password|hash|admin_sid/i);
  });

  it('fails closed for dependency status while retaining a usable response', async () => {
    const db = { query: vi.fn(async () => { throw new Error('database down'); }) };
    const sessions = { countActive: vi.fn(async () => { throw new Error('database down'); }) };
    const result = await new AdminDashboardService(db as any, sessions as any).overview();
    expect(result.counts).toEqual({ users: null, activeSessions: null, clients: null, memberships: null, suspendedMemberships: null, deletionRequests: null });
    expect(result.services).toEqual({ api: 'up', database: 'down' });
  });

  it('returns the newest deletion requests with bounded output', async () => {
    const db = {
      query: vi.fn(async (sql: string) => sql.includes('deletion_queue') && sql.includes('ORDER BY')
        ? { rows: [{ user_id: 'u-1', requested_at: '2026-08-07T00:00:00.000Z' }] }
        : { rows: [{ count: 0 }] }),
    };
    await expect(new AdminDashboardService(db as any, {} as any).deletionQueue()).resolves.toEqual([
      { userId: 'u-1', requestedAt: '2026-08-07T00:00:00.000Z' },
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 100'));
  });
});
