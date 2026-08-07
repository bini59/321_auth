export type ServiceMembershipLoadState = 'loading' | 'ready' | 'error';

export const SERVICE_MEMBERSHIP_PAGE_SIZE = 50;

export function hasMoreServiceMemberships(count: number, limit = SERVICE_MEMBERSHIP_PAGE_SIZE) {
  return count >= limit;
}

export function serviceMembershipMessage(state: ServiceMembershipLoadState | undefined, count: number) {
  if (state === 'loading') return '회원 목록을 불러오는 중입니다.';
  if (state === 'error') return '회원 목록을 불러오지 못했습니다.';
  if (count === 0) return '가입한 회원이 없습니다.';
  return null;
}
