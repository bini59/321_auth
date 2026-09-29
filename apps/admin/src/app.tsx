import { useEffect, useMemo, useState } from 'react';
import { useLogout, useSession, useUsers } from '@/api/queries';
import { CommandPalette, useCommandPalette, type Command } from '@/components/command-palette';
import { useTheme, type ThemePreference } from '@/hooks/use-theme';
import { AppShell } from '@/layout/app-shell';
import { BRAND, NAV, readSection, type Section } from '@/layout/nav';
import { SkeletonPage } from '@/layout/skeleton-page';
import { LoginPage } from '@/sections/login';
import { OperationsSection } from '@/sections/operations';
import { OverviewSection } from '@/sections/overview';
import { ServicesSection } from '@/sections/services';
import { SettingsSection } from '@/sections/settings';
import { UsersSection } from '@/sections/users';

// 팔레트는 명령을 실행하자마자 언마운트되므로 테마 상태(useTheme)는 Console이 들고 있다가 넘겨준다.
function ConsolePalette({ go, openUser, setTheme, onClose }: {
  go: (next: Section) => void;
  openUser: (userId: string) => void;
  setTheme: (next: ThemePreference) => void;
  onClose: () => void;
}) {
  const logout = useLogout();
  const users = useUsers(''); // 팔레트가 열려 있는 동안에만 사용자 목록을 조회한다.

  const commands = useMemo<Command[]>(() => [
    ...NAV.map((item) => ({ id: `go-${item.id}`, label: `${item.label}(으)로 이동`, group: '이동', badge: '↵', run: () => go(item.id) })),
    { id: 'theme-light', label: '테마: 라이트', group: '테마', badge: '☀', run: () => setTheme('light') },
    { id: 'theme-dark', label: '테마: 다크', group: '테마', badge: '☾', run: () => setTheme('dark') },
    { id: 'theme-system', label: '테마: 시스템', group: '테마', badge: '⌘', run: () => setTheme('system') },
    { id: 'logout', label: '로그아웃', group: '작업', badge: '⇥', run: () => logout.mutate() },
    ...(users.data ?? []).map((user) => ({
      id: `user-${user.userId}`,
      label: `${user.name || user.userId} 열기`,
      group: '사용자',
      badge: (user.name || '?').slice(0, 2),
      run: () => openUser(user.userId),
    })),
  ], [users.data]);

  return <CommandPalette commands={commands} onClose={onClose} />;
}

function Console() {
  const { setTheme } = useTheme();
  const palette = useCommandPalette();
  const [section, setSection] = useState<Section>(readSection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const go = (next: Section) => { window.location.hash = next; setSection(next); };
  const openUser = (userId: string) => { go('users'); setSelectedId(userId); };

  return (
    <>
      <AppShell section={section} onNavigate={go} onOpenPalette={() => palette.setOpen(true)}>
        {section === 'overview' ? (
          <OverviewSection />
        ) : section === 'users' ? (
          <UsersSection search={search} onSearch={setSearch} selectedId={selectedId} onSelect={setSelectedId} />
        ) : section === 'clients' ? (
          <ServicesSection />
        ) : section === 'operations' ? (
          <OperationsSection />
        ) : (
          <SettingsSection />
        )}
      </AppShell>

      {palette.open && <ConsolePalette go={go} openUser={openUser} setTheme={setTheme} onClose={() => palette.setOpen(false)} />}
    </>
  );
}

export function App() {
  const isLogin = window.location.pathname === '/admin/login';
  const session = useSession(!isLogin);

  useEffect(() => {
    if (session.isError) {
      window.location.replace(`/admin/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
    }
  }, [session.isError]);

  if (isLogin) return <LoginPage brandName={BRAND.name} host={BRAND.host} />;
  if (!session.isSuccess) return <SkeletonPage />;
  return <Console />;
}
