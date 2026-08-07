import { describe, expect, it } from 'vitest';
import { hasMoreServiceMemberships, serviceMembershipMessage } from './service-memberships';

describe('service membership panel state', () => {
  it('covers loading, error, empty, and populated states', () => {
    expect(serviceMembershipMessage('loading', 0)).toBe('회원 목록을 불러오는 중입니다.');
    expect(serviceMembershipMessage('error', 0)).toBe('회원 목록을 불러오지 못했습니다.');
    expect(serviceMembershipMessage('ready', 0)).toBe('가입한 회원이 없습니다.');
    expect(serviceMembershipMessage('ready', 1)).toBeNull();
  });

  it('keeps loading more available for a full bounded page', () => {
    expect(hasMoreServiceMemberships(49)).toBe(false);
    expect(hasMoreServiceMemberships(50)).toBe(true);
    expect(hasMoreServiceMemberships(51)).toBe(true);
  });
});
