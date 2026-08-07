import { describe, expect, it, vi } from 'vitest';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  it('includes membership counts while preserving the service list shape', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ client_id: 'archive', name: 'Archive', membership_count: 3, is_active: true }] }) };
    const service = new ClientsService(db as never);

    await expect(service.list()).resolves.toEqual([{ client_id: 'archive', name: 'Archive', membership_count: 3, is_active: true }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('COUNT(m.user_id)::int AS membership_count'));
  });
});
