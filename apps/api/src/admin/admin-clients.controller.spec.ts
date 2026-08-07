import { describe, expect, it, vi } from 'vitest';
import { AdminClientsController } from './admin-clients.controller';
import { validateClientInput } from '../clients/client-input';

describe('AdminClientsController', () => {
  it('never returns secret_hash when creating a client', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ rowCount: 1 }),
      find: vi.fn().mockResolvedValue({ client_id: 'x', name: 'X', secret_hash: 'private', allowed_origins: ['https://x.example'], default_redirect: 'https://x.example/', auto_provision: true, onboarding_path: null, is_active: true }),
    };
    const result = await new AdminClientsController(service as never).create({ client_id: 'x', name: 'X', allowed_origins: ['https://x.example'], default_redirect: 'https://x.example/', auto_provision: true });
    expect(result.client).not.toHaveProperty('secret_hash');
    expect(result.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('exposes canonical Service fields without removing legacy client fields', async () => {
    const service = { list: vi.fn().mockResolvedValue([{ client_id: 'archive', name: 'Archive', auto_provision: false }]) };
    const result = await new AdminClientsController(service as never).list();
    expect(result[0]).toMatchObject({ client_id: 'archive', service_id: 'archive', serviceId: 'archive', service_name: 'Archive', serviceName: 'Archive' });
  });

  it('rejects conflicting canonical and legacy service identifiers', () => {
    expect(() => validateClientInput({ client_id: 'a', service_id: 'b', name: 'A', allowed_origins: ['https://a.example'], default_redirect: 'https://a.example/', auto_provision: false })).toThrow('conflicting service identifiers');
  });
});
