import { describe, expect, it, vi } from 'vitest';
import { AdminClientsController } from './admin-clients.controller';

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
});
