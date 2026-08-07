import { describe, expect, it, vi } from 'vitest';
import { AdminManagementService } from './admin-management.service';

describe('AdminManagementService', () => {
  it('rejects invalid membership changes before touching the database', async () => {
    const db = { query: vi.fn() };
    const service = new AdminManagementService(db as never, { revokeAll: vi.fn() } as never);
    await expect(service.updateMembership('u', 'c', 'superuser')).rejects.toThrow('invalid role');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('revokes every session only for an existing user', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{}] }) };
    const revokeAll = vi.fn();
    const service = new AdminManagementService(db as never, { revokeAll } as never);
    await service.revokeAllSessions('u');
    expect(revokeAll).toHaveBeenCalledWith('u');
  });
});
