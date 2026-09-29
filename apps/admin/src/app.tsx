import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type AdminMembership, type AdminUser } from '@/api';
import { CommandPalette, useCommandPalette, type Command } from '@/components/command-palette';
import { useToast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { AppShell } from '@/layout/app-shell';
import { BRAND, NAV, readSection, type Section } from '@/layout/nav';
import { SkeletonPage } from '@/layout/skeleton-page';
import { LoginPage } from '@/sections/login';
import { OperationsSection } from '@/sections/operations';
import { OverviewSection } from '@/sections/overview';
import { ServicesSection } from '@/sections/services';
import { SettingsSection } from '@/sections/settings';
import { UsersSection } from '@/sections/users';

const LOAD_ERROR: Partial<Record<Section, string>> = {
  overview: '운영 현황을 불러오지 못했습니다.',
  users: '사용자 목록을 불러오지 못했습니다.',
  operations: '운영 기록을 불러오지 못했습니다.',
};

function Console() {
  const { toast, confirm } = useToast();
  const { setTheme } = useTheme();
  const palette = useCommandPalette();
  const qc = useQueryClient();

  const [section, setSection] = useState<Section>(readSection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const health = useQuery({ queryKey: ['health'], queryFn: () => authApi.health() });
  // 서버가 호출할 때마다 admin_csrf 쿠키를 새로 발급하므로 페이지당 한 번만 조회한다.
  const csrf = useQuery({ queryKey: ['csrf'], queryFn: () => authApi.csrf(), staleTime: Infinity });
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => authApi.overview(), enabled: section === 'overview' });
  const users = useQuery({
    queryKey: ['users', search],
    queryFn: () => authApi.users(search),
    enabled: section === 'users',
    placeholderData: keepPreviousData, // 검색어가 바뀌는 동안 이전 목록을 유지해 입력창이 언마운트되지 않게 한다.
  });
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => authApi.audit(), enabled: section === 'operations' });
  const queue = useQuery({ queryKey: ['deletion-queue'], queryFn: () => authApi.deletionQueue(), enabled: section === 'operations' });
  const detail = useQuery({
    queryKey: ['user', selectedId],
    queryFn: () => authApi.user(selectedId!),
    enabled: selectedId !== null,
    placeholderData: keepPreviousData,
    meta: { error: '사용자 상세 정보를 불러오지 못했습니다.' },
  });

  const csrfToken = csrf.data?.csrfToken ?? '';
  const apiUp = health.isPending ? null : health.isSuccess;
  const selected = selectedId ? (detail.data ?? null) : null;
  // 현재 섹션이 쓰는 쿼리만 로딩/에러 표시에 반영한다.
  const page = { overview: [overview], users: [users], clients: [], operations: [audit, queue], settings: [] }[section];
  const loading = page.some((query) => query.isLoading);
  const error = page.some((query) => query.isError) ? LOAD_ERROR[section] : undefined;

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const go = (next: Section) => { window.location.hash = next; setSection(next); };

  const openUser = (user: AdminUser) => setSelectedId(user.userId);

  const updateMembership = async (membership: AdminMembership, update: { role?: string; status?: string }) => {
    if (!selected || !csrfToken) return;
    const ok = await confirm(`${membership.clientName} 회원 자격을 변경할까요?`, { confirmLabel: '변경' });
    if (!ok) return;
    try {
      await authApi.updateMembership(selected.userId, membership.clientId, csrfToken, update);
      await qc.invalidateQueries({ queryKey: ['user', selected.userId] });
      toast('회원 자격을 변경했습니다.');
    } catch {
      toast('멤버십 변경에 실패했습니다.', 'danger');
    }
  };

  const revokeSessions = async () => {
    if (!selected || !csrfToken) return;
    const ok = await confirm(`${selected.name || selected.userId}의 모든 세션을 폐기할까요?`, { confirmLabel: '폐기', tone: 'danger' });
    if (!ok) return;
    try {
      await authApi.revokeSessions(selected.userId, csrfToken);
      toast('모든 세션을 폐기했습니다.', 'danger');
    } catch {
      toast('세션 폐기에 실패했습니다.', 'danger');
    }
  };

  const logout = async () => {
    await authApi.logout(csrfToken);
    window.location.assign('/admin/login');
  };

  const commands = useMemo<Command[]>(() => [
    ...NAV.map((item) => ({ id: `go-${item.id}`, label: `${item.label}(으)로 이동`, group: '이동', badge: '↵', run: () => go(item.id) })),
    { id: 'theme-light', label: '테마: 라이트', group: '테마', badge: '☀', run: () => setTheme('light') },
    { id: 'theme-dark', label: '테마: 다크', group: '테마', badge: '☾', run: () => setTheme('dark') },
    { id: 'theme-system', label: '테마: 시스템', group: '테마', badge: '⌘', run: () => setTheme('system') },
    { id: 'logout', label: '로그아웃', group: '작업', badge: '⇥', run: () => void logout() },
    ...(users.data ?? []).map((user) => ({
      id: `user-${user.userId}`,
      label: `${user.name || user.userId} 열기`,
      group: '사용자',
      badge: (user.name || '?').slice(0, 2),
      run: () => { go('users'); openUser(user); },
    })),
  ], [users.data, csrfToken]);

  return (
    <>
      <AppShell
        section={section}
        apiUp={apiUp}
        onNavigate={go}
        onOpenPalette={() => palette.setOpen(true)}
        onLogout={() => void logout()}
      >
        {error && <p className="error" role="alert">{error}</p>}
        {loading ? (
          <SkeletonPage />
        ) : section === 'overview' ? (
          <OverviewSection data={overview.data ?? null} />
        ) : section === 'users' ? (
          <UsersSection
            users={users.data ?? []}
            selected={selected}
            search={search}
            loading={users.isPlaceholderData}
            onSearch={setSearch}
            onOpen={openUser}
            onCloseDetail={() => setSelectedId(null)}
            onMembership={(membership, update) => void updateMembership(membership, update)}
            onRevoke={() => void revokeSessions()}
          />
        ) : section === 'clients' ? (
          <ServicesSection csrfToken={csrfToken} />
        ) : section === 'operations' ? (
          <OperationsSection audit={audit.data ?? []} queue={queue.data ?? []} />
        ) : (
          <SettingsSection />
        )}
      </AppShell>

      {palette.open && <CommandPalette commands={commands} onClose={() => palette.setOpen(false)} />}
    </>
  );
}

export function App() {
  const isLogin = window.location.pathname === '/admin/login';
  // 페이지당 한 번만 확인한다. 이후 만료는 각 API 호출의 401 처리가 맡는다.
  const session = useQuery({ queryKey: ['session'], queryFn: () => authApi.session(), enabled: !isLogin, staleTime: Infinity });

  useEffect(() => {
    if (session.isError) {
      window.location.replace(`/admin/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
    }
  }, [session.isError]);

  if (isLogin) return <LoginPage brandName={BRAND.name} host={BRAND.host} />;
  if (!session.isSuccess) return <SkeletonPage />;
  return <Console />;
}
