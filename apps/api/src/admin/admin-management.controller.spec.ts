import { describe, expect, it, vi } from 'vitest';
import { AdminManagementController } from './admin-management.controller';

describe('AdminManagementController', () => {
  it('normalizes list bounds', async () => {
    const management = { listUsers: vi.fn().mockResolvedValue([]) };
    const controller = new AdminManagementController(management as never, {} as never);
    await controller.users('alice', '9999', '-10');
    expect(management.listUsers).toHaveBeenCalledWith('alice', 100, 0);
  });

  it('requires an explicit membership change', async () => {
    const management = { updateMembership: vi.fn().mockRejectedValue(new Error('role or status required')) };
    const controller = new AdminManagementController(management as never, {} as never);
    await expect(controller.membership('00000000-0000-4000-8000-000000000001', 'c', {})).rejects.toMatchObject({ status: 400 });
  });

  it('rejects malformed identifiers at the HTTP boundary', async () => {
    const controller = new AdminManagementController({ getUser: vi.fn() } as never, {} as never);
    await expect(Promise.resolve().then(() => controller.user('not-a-uuid'))).rejects.toMatchObject({ status: 400 });
  });
});
