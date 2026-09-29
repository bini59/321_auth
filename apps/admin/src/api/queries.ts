import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { authApi } from './index';

// 서버가 호출할 때마다 admin_csrf 쿠키를 새로 발급하므로 페이지당 한 번만 조회한다.
const csrfQuery = { queryKey: ['csrf'], queryFn: () => authApi.csrf(), staleTime: Infinity, gcTime: Infinity } as const;
export const getCsrfToken = (qc: QueryClient) => qc.ensureQueryData(csrfQuery).then((data) => data.csrfToken);

const SERVICES = ['services'] as const;
const userKey = (userId: string | null) => ['user', userId] as const;

// 페이지당 한 번만 확인한다. 이후 만료는 각 API 호출의 401 처리가 맡는다.
export const sessionQuery = { queryKey: ['session'], queryFn: () => authApi.session(), staleTime: Infinity } as const;
export const useSession = (enabled: boolean) => useQuery({ ...sessionQuery, enabled });
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: () => authApi.health() });
export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => authApi.overview() });
export const useAudit = () => useQuery({ queryKey: ['audit'], queryFn: () => authApi.audit() });
export const useDeletionQueue = () => useQuery({ queryKey: ['deletion-queue'], queryFn: () => authApi.deletionQueue() });
export const useServices = () => useQuery({ queryKey: SERVICES, queryFn: () => authApi.services(), meta: { error: 'Service 목록을 불러오지 못했습니다.' } });

// 검색어가 바뀌는 동안 이전 목록을 유지해 입력창이 언마운트되지 않게 한다.
export const useUsers = (search: string) => useQuery({ queryKey: ['users', search], queryFn: () => authApi.users(search), placeholderData: keepPreviousData });
export const useUser = (userId: string | null) => useQuery({
  queryKey: userKey(userId),
  queryFn: () => authApi.user(userId!),
  enabled: userId !== null,
  placeholderData: keepPreviousData,
  meta: { error: '사용자 상세 정보를 불러오지 못했습니다.' },
});

/** csrf 토큰을 붙여 변경 요청을 보내고, 성공하면 invalidate가 가리키는 쿼리를 다시 불러온다. */
function useAdminMutation<V, R>(send: (variables: V, csrfToken: string) => Promise<R>, invalidate: (variables: V) => QueryKey[] = () => []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (variables: V) => send(variables, await getCsrfToken(qc)),
    onSuccess: (_data, variables) => Promise.all(invalidate(variables).map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const useUpdateMembership = () => useAdminMutation(
  ({ userId, clientId, update }: { userId: string; clientId: string; update: { role?: string; status?: string } }, csrfToken) =>
    authApi.updateMembership(userId, clientId, csrfToken, update),
  ({ userId }) => [userKey(userId)],
);
export const useRevokeSessions = () => useAdminMutation((userId: string, csrfToken) => authApi.revokeSessions(userId, csrfToken));
export const useCreateService = () => useAdminMutation((body: unknown, csrfToken) => authApi.createService(body, csrfToken), () => [SERVICES]);
export const useUpdateService = () => useAdminMutation(({ id, body }: { id: string; body: unknown }, csrfToken) => authApi.updateService(id, body, csrfToken), () => [SERVICES]);
export const useSetServiceActive = () => useAdminMutation(({ id, active }: { id: string; active: boolean }, csrfToken) => authApi.setServiceActive(id, active, csrfToken), () => [SERVICES]);
export const useRotateServiceSecret = () => useAdminMutation((id: string, csrfToken) => authApi.rotateServiceSecret(id, csrfToken));

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => authApi.logout(await getCsrfToken(qc)),
    onSuccess: () => window.location.assign('/admin/login'),
  });
}
