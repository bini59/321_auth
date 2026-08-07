import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  authApi,
  type AdminAudit,
  type AdminMembership,
  type AdminOverview,
  type AdminUser,
  type AdminUserDetail,
  type DeletionQueueItem,
} from './api';
import './theme.css';
import './style.css';
import { ActivityIcon, BoxIcon, GridIcon, LogoutIcon, SearchIcon, SettingsIcon, UsersIcon } from './icons';
import { ThemeToggle } from './theme-toggle';
import { useTheme } from './use-theme';
import { ToastProvider, useToast } from './toast';
import { CommandPalette, useCommandPalette, type Command } from './command-palette';
import { OverviewSection } from './sections/overview';
import { UsersSection } from './sections/users';
import { ServicesSection } from './sections/services';
import { OperationsSection } from './sections/operations';
import { SettingsSection } from './sections/settings';
import { LoginPage } from './sections/login';

const SECTIONS = ['overview', 'users', 'clients', 'operations', 'settings'] as const;
type Section = (typeof SECTIONS)[number];

const NAV: Array<{ id: Section; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'overview', label: '개요', icon: GridIcon },
  { id: 'users', label: '사용자', icon: UsersIcon },
  { id: 'clients', label: '서비스', icon: BoxIcon },
  { id: 'operations', label: '운영', icon: ActivityIcon },
  { id: 'settings', label: '설정', icon: SettingsIcon },
];
const TITLE: Record<Section, string> = { overview: '개요', users: '사용자', clients: '서비스', operations: '운영', settings: '설정' };
const BRAND = { name: 'Auth Admin', host: 'bini59.dev' };

function readSection(): Section {
  const value = window.location.hash.slice(1);
  return (SECTIONS as readonly string[]).includes(value) ? (value as Section) : 'overview';
}

function SkeletonPage() {
  return (
    <div className="skeleton-page">
      <div className="skeleton" style={{ height: 20, width: 180, borderRadius: 6 }} />
      <div className="metrics">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
      </div>
      <div className="skeleton" style={{ height: 280 }} />
    </div>
  );
}

function Console() {
  const { toast, confirm } = useToast();
  const { setTheme } = useTheme();
  const palette = useCommandPalette();

  const [section, setSection] = useState<Section>(readSection);
  const [loading, setLoading] = useState(true);
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [search, setSearch] = useState('');
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    authApi.health().then(() => setApiUp(true)).catch(() => setApiUp(false));
    authApi.csrf().then(({ csrfToken: token }) => setCsrfToken(token)).catch(() => undefined);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError('');
    setLoading(true);
    const done = () => { if (!cancelled) setLoading(false); };

    if (section === 'overview') {
      authApi.overview().then((data) => !cancelled && setOverview(data)).catch(() => setError('운영 현황을 불러오지 못했습니다.')).finally(done);
    } else if (section === 'users') {
      authApi.users(search).then((data) => !cancelled && setUsers(data)).catch(() => setError('사용자 목록을 불러오지 못했습니다.')).finally(done);
    } else if (section === 'operations') {
      Promise.all([
        authApi.audit().then((data) => !cancelled && setAudit(data)),
        authApi.deletionQueue().then((data) => !cancelled && setDeletionQueue(data)),
      ]).catch(() => setError('운영 기록을 불러오지 못했습니다.')).finally(done);
    } else {
      done();
    }
    return () => { cancelled = true; };
  }, [section, search]);

  const go = (next: Section) => { window.location.hash = next; setSection(next); };

  const openUser = (user: AdminUser) =>
    authApi.user(user.userId).then(setSelected).catch(() => toast('사용자 상세 정보를 불러오지 못했습니다.', 'danger'));

  const updateMembership = async (membership: AdminMembership, update: { role?: string; status?: string }) => {
    if (!selected || !csrfToken) return;
    const ok = await confirm(`${membership.clientName} 회원 자격을 변경할까요?`, { confirmLabel: '변경' });
    if (!ok) return;
    try {
      await authApi.updateMembership(selected.userId, membership.clientId, csrfToken, update);
      setSelected(await authApi.user(selected.userId));
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
    ...users.map((user) => ({
      id: `user-${user.userId}`,
      label: `${user.name || user.userId} 열기`,
      group: '사용자',
      badge: (user.name || '?').slice(0, 2),
      run: () => { go('users'); void openUser(user); },
    })),
  ], [users, csrfToken]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div style={{ display: 'grid', gap: 1 }}>
            <span className="brand-name">{BRAND.name}</span>
            <span className="brand-host mono">{BRAND.host}</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={id === section ? 'nav-item active' : 'nav-item'} onClick={() => go(id)}>
              <Icon />{label}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <div className="sidebar-foot">
          <ThemeToggle />
          <button className="nav-item" onClick={() => void logout()}>
            <LogoutIcon />로그아웃
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="crumb">
            <span className="mono">auth</span><span>/</span><strong>{TITLE[section]}</strong>
          </div>
          <span className="spacer" />
          <button className="cmdk-btn" onClick={() => palette.setOpen(true)}>
            <SearchIcon size={13} />검색 및 명령<span className="spacer" /><kbd>⌘K</kbd>
          </button>
          <div className="status-pill">
            <span className={apiUp === false ? 'dot dot--down' : 'dot dot--ok'} />
            API {apiUp === null ? '확인 중' : apiUp ? '정상' : '확인 필요'}
          </div>
          <div className="avatar">KV</div>
        </header>

        <main className="page">
          {error && <p className="error" role="alert">{error}</p>}
          {loading ? (
            <SkeletonPage />
          ) : section === 'overview' ? (
            <OverviewSection data={overview} />
          ) : section === 'users' ? (
            <UsersSection
              users={users}
              selected={selected}
              search={search}
              loading={loading}
              onSearch={setSearch}
              onOpen={(user) => void openUser(user)}
              onCloseDetail={() => setSelected(null)}
              onMembership={(membership, update) => void updateMembership(membership, update)}
              onRevoke={() => void revokeSessions()}
            />
          ) : section === 'clients' ? (
            <ServicesSection csrfToken={csrfToken} />
          ) : section === 'operations' ? (
            <OperationsSection audit={audit} queue={deletionQueue} />
          ) : (
            <SettingsSection />
          )}
        </main>
      </div>

      {palette.open && <CommandPalette commands={commands} onClose={() => palette.setOpen(false)} />}
    </div>
  );
}

function App() {
  if (window.location.pathname === '/admin/login') return <LoginPage brandName={BRAND.name} host={BRAND.host} />;
  return <Console />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
