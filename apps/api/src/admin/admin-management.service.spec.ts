import { describe, expect, it, vi } from 'vitest';
import { AdminManagementService } from './admin-management.service';

describe('AdminManagementService', () => {
  it('rejects invalid membership statuses before touching the database', async () => {
    const db = { query: vi.fn() };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);
    await expect(service.updateMembership('u', 'c', { status: 'superuser' })).rejects.toThrow('invalid status');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('updates only status while preserving the membership role', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ client_id: 'c', role: 'admin', status: 'suspended', joined_at: 'joined', last_seen_at: null }] }) };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);

    await expect(service.updateMembership('u', 'c', { status: 'suspended' })).resolves.toEqual({ clientId: 'c', role: 'admin', status: 'suspended', joinedAt: 'joined', lastSeenAt: null });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE memberships SET role = COALESCE($3, role), status = COALESCE($4, status)'),
      ['u', 'c', null, 'suspended'],
    );
  });

  it('updates only role while preserving membership status', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ client_id: 'c', role: 'admin', status: 'active', joined_at: 'joined', last_seen_at: null }] }) };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);

    await expect(service.updateMembership('u', 'c', { role: 'admin' })).resolves.toEqual({ clientId: 'c', role: 'admin', status: 'active', joinedAt: 'joined', lastSeenAt: null });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('SET role = COALESCE($3, role)'), ['u', 'c', 'admin', null]);
  });

  it('rejects invalid membership roles before touching the database', async () => {
    const db = { query: vi.fn() };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);
    await expect(service.updateMembership('u', 'c', { role: 'superuser' })).rejects.toThrow('invalid role');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists a service membership roster in newest-joined order with bounded pagination', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1', email: 'a@example.com', name: 'A', role: 'member', status: 'active', joined_at: 'new', last_seen_at: null }] }),
    };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);

    await expect(service.listClientMemberships('archive', 100, 200)).resolves.toEqual([
      { userId: 'u1', email: 'a@example.com', name: 'A', role: 'member', status: 'active', joinedAt: 'new', lastSeenAt: null },
    ]);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('ORDER BY m.joined_at DESC'), ['archive', 100, 200]);
  });

  it('distinguishes a missing service from an empty membership roster', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);
    await expect(service.listClientMemberships('missing', 50, 0)).rejects.toThrow('client not found');
  });

  it('revokes every session only for an existing user', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{}] }) };
    const revokeAll = vi.fn();
    const service = new AdminManagementService(db as never, { revokeAll } as never);
    await service.revokeAllSessions('u');
    expect(revokeAll).toHaveBeenCalledWith('u');
  });
});
