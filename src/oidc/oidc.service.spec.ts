import { describe, expect, it } from 'vitest';
import { OidcService } from './oidc.service';

const service = new OidcService(null as never);

describe('normalize (PRD §7.6)', () => {
  it('google 클레임 매핑', () => {
    const n = service.normalize('google', {
      sub: 'g123',
      email: 'a@example.com',
      email_verified: true,
      name: 'Kevin',
      picture: 'https://x/p.png',
    });
    expect(n).toEqual({
      provider: 'google',
      providerUserId: 'g123',
      email: 'a@example.com',
      emailVerified: true,
      name: 'Kevin',
      avatarUrl: 'https://x/p.png',
    });
  });

  it('kakao — 이메일 없이 nickname만 (정상 경로)', () => {
    const n = service.normalize('kakao', {
      sub: '1234567890',
      nickname: '케빈',
    });
    expect(n).toEqual({
      provider: 'kakao',
      providerUserId: '1234567890',
      email: null,
      emailVerified: false,
      name: '케빈',
      avatarUrl: null,
    });
  });

  it('kakao email_verified는 제공하지 않으므로 false', () => {
    const n = service.normalize('kakao', { sub: '1', email: 'k@example.com' });
    expect(n.emailVerified).toBe(false);
  });
});
