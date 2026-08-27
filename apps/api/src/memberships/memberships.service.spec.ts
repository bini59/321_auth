import { describe, expect, it, vi } from 'vitest';
import { MembershipsService } from './memberships.service';

describe('MembershipsService.listForUser', () => {
  it('maps rows to the portal shape', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { client_id: 'archive', client_name: 'Archive', theme_color: '#3b82f6', role: 'member', status: 'active', last_seen_at: new Date('2026-08-20T00:00:00.000Z') },
          { client_id: 'notes', client_name: 'Notes', theme_color: null, role: 'owner', status: 'active', last_seen_at: null },
        ],
      }),
    };

    await expect(new MembershipsService(db as never).listForUser('u1')).resolves.toEqual([
      { clientId: 'archive', clientName: 'Archive', themeColor: '#3b82f6', role: 'member', status: 'active', lastSeenAt: new Date('2026-08-20T00:00:00.000Z') },
      { clientId: 'notes', clientName: 'Notes', themeColor: null, role: 'owner', status: 'active', lastSeenAt: null },
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['u1']);
  });

  it('hides memberships of deactivated services', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await new MembershipsService(db as never).listForUser('u1');
    expect(db.query.mock.calls[0][0]).toContain('c.is_active');
  });
});
