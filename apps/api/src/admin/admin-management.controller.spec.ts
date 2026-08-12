import { describe, expect, it, vi } from 'vitest';
import { AdminManagementController } from './admin-management.controller';

describe('AdminManagementController', () => {
  it('normalizes list bounds', async () => {
    const management = { listUsers: vi.fn().mockResolvedValue([]) };
    const controller = new AdminManagementController(management as never, {} as never);
    await controller.users('alice', '9999', '-10');
    expect(management.listUsers).toHaveBeenCalledWith('alice', 100, 0);
  });

  it('delegates the protected service membership route with safe bounds', async () => {
    const management = { listClientMemberships: vi.fn().mockResolvedValue([]) };
    const controller = new AdminManagementController(management as never, {} as never);
    await controller.clientMemberships('archive', '99', '100');
    expect(management.listClientMemberships).toHaveBeenCalledWith('archive', 99, 100);
  });

  it.each([
    ['non-numeric limit', 'abc', undefined],
    ['fractional offset', undefined, '100001.9'],
    ['too-large offset', undefined, '100001'],
  ])('rejects %s pagination values', async (_label, limit, offset) => {
    const controller = new AdminManagementController({ listClientMemberships: vi.fn() } as never, {} as never);
    await expect(Promise.resolve().then(() => controller.clientMemberships('archive', limit, offset))).rejects.toMatchObject({ status: 400 });
  });

  it('accepts client ids using the shared client-id rules', async () => {
    const management = { listClientMemberships: vi.fn().mockResolvedValue([]) };
    const controller = new AdminManagementController(management as never, {} as never);
    await controller.clientMemberships('archive.v2');
    expect(management.listClientMemberships).toHaveBeenCalledWith('archive.v2', 50, 0);
  });

  it('rejects malformed service identifiers for the membership route', async () => {
    const controller = new AdminManagementController({ listClientMemberships: vi.fn() } as never, {} as never);
    await expect(Promise.resolve().then(() => controller.clientMemberships('bad/id'))).rejects.toMatchObject({ status: 400 });
  });

  it('requires an explicit membership status', async () => {
    const management = { updateMembership: vi.fn().mockRejectedValue(new Error('status required')) };
    const controller = new AdminManagementController(management as never, {} as never);
    await expect(controller.membership('00000000-0000-4000-8000-000000000001', 'c', {})).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['array', []],
    ['unknown field', { status: 'active', extra: true }],
    ['missing status', {}],
    ['non-string status', { status: null }],
  ])('rejects %s membership PATCH bodies with 400', async (_label, body) => {
    const controller = new AdminManagementController({ updateMembership: vi.fn() } as never, {} as never);
    await expect(Promise.resolve().then(() => controller.membership('00000000-0000-4000-8000-000000000001', 'c', body))).rejects.toMatchObject({ status: 400 });
  });

  it('passes status only and records no membership role mutation', async () => {
    const management = { updateMembership: vi.fn().mockResolvedValue({ status: 'suspended' }) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const controller = new AdminManagementController(management as never, audit as never);

    await controller.membership('00000000-0000-4000-8000-000000000001', 'c', { status: 'suspended' });

    expect(management.updateMembership).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'c', { status: 'suspended' });
    expect(audit.record).toHaveBeenCalledWith({ action: 'membership.update', userId: '00000000-0000-4000-8000-000000000001', clientId: 'c', details: { status: 'suspended' } });
  });

  it('passes a role-only membership patch', async () => {
    const management = { updateMembership: vi.fn().mockResolvedValue({ role: 'admin' }) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const controller = new AdminManagementController(management as never, audit as never);

    await controller.membership('00000000-0000-4000-8000-000000000001', 'c', { role: 'admin' });

    expect(management.updateMembership).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'c', { role: 'admin' });
    expect(audit.record).toHaveBeenCalledWith({ action: 'membership.update', userId: '00000000-0000-4000-8000-000000000001', clientId: 'c', details: { role: 'admin' } });
  });

  it('rejects malformed identifiers at the HTTP boundary', async () => {
    const controller = new AdminManagementController({ getUser: vi.fn() } as never, {} as never);
    await expect(Promise.resolve().then(() => controller.user('not-a-uuid'))).rejects.toMatchObject({ status: 400 });
  });
});
