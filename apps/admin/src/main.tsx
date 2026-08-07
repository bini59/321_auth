import { FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { authApi, type AdminAudit, type AdminMembership, type AdminUser, type AdminUserDetail } from './api';
import './style.css';
import './admin-management.css';

const sections = ['overview', 'users', 'memberships', 'clients', 'operations'] as const;
type Section = typeof sections[number];

function readSection(): Section {
  const value = window.location.hash.slice(1);
  return (sections as readonly string[]).includes(value) ? value as Section : 'overview';
}

function LoginPage() {
  const [password, setPassword] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [error, setError] = useState('');
  const returnTo = new URLSearchParams(window.location.search).get('return_to') || '/admin';

  useEffect(() => {
    authApi.csrf().then(({ csrfToken: token }) => setCsrfToken(token)).catch(() => setError('로그인 준비에 실패했습니다.'));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const result = await authApi.login(password, csrfToken, returnTo);
      window.location.assign(result.returnTo);
    } catch {
      setError('관리자 인증에 실패했습니다.');
    }
  };

  return <main className="login-page"><form className="login-card" onSubmit={(event) => void submit(event)}><p className="eyebrow">AUTH ADMIN</p><h1>관리자 로그인</h1><p className="muted">운영 콘솔에 접근하려면 관리자 비밀번호가 필요합니다.</p><label htmlFor="admin-password">비밀번호</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary" type="submit" disabled={!csrfToken}>로그인</button>{error && <p className="error" role="alert">{error}</p>}</form></main>;
}

function App() {
  if (window.location.pathname === '/admin/login') return <LoginPage />;
  return <Console />;
}

function Console() {
  const [section, setSection] = useState<Section>(readSection);
  const [apiStatus, setApiStatus] = useState('확인 중');
  const [csrfToken, setCsrfToken] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [search, setSearch] = useState('');
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    authApi.health().then(() => setApiStatus('정상')).catch(() => setApiStatus('확인 필요'));
    authApi.csrf().then(({ csrfToken: token }) => setCsrfToken(token)).catch(() => undefined);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (section === 'users') authApi.users(search).then(setUsers).catch(() => setError('사용자 목록을 불러오지 못했습니다.'));
    if (section === 'operations') authApi.audit().then(setAudit).catch(() => setError('감사 기록을 불러오지 못했습니다.'));
  }, [section, search]);

  const openUser = (user: AdminUser) => authApi.user(user.userId).then(setSelected).catch(() => setError('사용자 상세 정보를 불러오지 못했습니다.'));
  const updateMembership = async (membership: AdminMembership, update: { role?: string; status?: string }) => {
    if (!selected || !csrfToken || !window.confirm('이 멤버십을 변경할까요?')) return;
    try { await authApi.updateMembership(selected.userId, membership.clientId, csrfToken, update); setSelected(await authApi.user(selected.userId)); }
    catch { setError('멤버십 변경에 실패했습니다.'); }
  };
  const revokeSessions = async () => {
    if (!selected || !csrfToken || !window.confirm('이 사용자의 모든 세션을 폐기할까요?')) return;
    try { await authApi.revokeSessions(selected.userId, csrfToken); setError('모든 세션을 폐기했습니다.'); }
    catch { setError('세션 폐기에 실패했습니다.'); }
  };

  const logout = async () => {
    await authApi.logout(csrfToken);
    window.location.assign('/admin/login');
  };

  return <div className="shell"><aside><div className="brand">AUTH<span>ADMIN</span></div><nav>{sections.map((item) => <button className={item === section ? 'active' : ''} key={item} onClick={() => { window.location.hash = item; }}>{item}</button>)}</nav><button className="logout" onClick={() => void logout()}>로그아웃</button></aside><main><header><div><p className="eyebrow">CENTRAL AUTHORITY</p><h1>{section}</h1></div><span className="status"><i /> API {apiStatus}</span></header>{error && <p className="error" role="alert">{error}</p>}{section === 'users' ? <UsersPanel users={users} selected={selected} search={search} onSearch={setSearch} onOpen={openUser} onMembership={updateMembership} onRevoke={revokeSessions} /> : section === 'operations' ? <AuditPanel entries={audit} /> : <section className="card"><p className="eyebrow">ADMIN CONSOLE</p><h2>{section === 'overview' ? '운영 현황을 한 곳에서 확인합니다.' : section + ' 관리 영역'}</h2><p className="muted">관리자 인증 세션으로 보호된 운영 콘솔입니다.</p></section>}</main></div>;
}

function UsersPanel({ users, selected, search, onSearch, onOpen, onMembership, onRevoke }: { users: AdminUser[]; selected: AdminUserDetail | null; search: string; onSearch: (value: string) => void; onOpen: (user: AdminUser) => void; onMembership: (membership: AdminMembership, update: { role?: string; status?: string }) => void; onRevoke: () => void }) {
  return <div className="users-layout"><section className="card user-list"><input aria-label="사용자 검색" placeholder="이름, 이메일 또는 ID 검색" value={search} onChange={(event) => onSearch(event.target.value)} />{users.map((user) => <button className={selected?.userId === user.userId ? 'user-row active' : 'user-row'} key={user.userId} onClick={() => onOpen(user)}><strong>{user.name || '(이름 없음)'}</strong><span>{user.email || '이메일 없음'}</span><small>{user.providerCount} providers · {user.membershipCount} memberships</small></button>)}{users.length === 0 && <p className="muted">사용자가 없습니다.</p>}</section>{selected ? <section className="card user-detail"><div className="detail-head"><div><p className="eyebrow">USER DETAIL</p><h2>{selected.name || '(이름 없음)'}</h2><p className="muted">{selected.email || '이메일 없음'} · {selected.userId}</p></div><button className="danger" onClick={onRevoke}>모든 세션 폐기</button></div><h3>Provider</h3><p>{selected.identities.map((identity) => `${identity.provider} (${identity.providerUserId})`).join(', ') || '연결된 Provider 없음'}</p><h3>멤버십</h3>{selected.memberships.map((membership) => <div className="membership-row" key={membership.clientId}><div><strong>{membership.clientName}</strong><small>{membership.clientId}</small></div><select aria-label={`${membership.clientName} 상태`} value={membership.status} onChange={(event) => onMembership(membership, { status: event.target.value })}><option value="active">active</option><option value="suspended">suspended</option></select><select aria-label={`${membership.clientName} 역할`} value={membership.role} onChange={(event) => onMembership(membership, { role: event.target.value })}><option value="member">member</option><option value="admin">admin</option><option value="owner">owner</option></select></div>)}</section> : <section className="card"><p className="muted">왼쪽에서 사용자를 선택하세요.</p></section>}</div>;
}

function AuditPanel({ entries }: { entries: AdminAudit[] }) { return <section className="card audit-list"><p className="eyebrow">AUDIT LOG</p><h2>관리 작업 기록</h2>{entries.map((entry) => <div className="audit-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.userId || 'system'}{entry.clientId ? ` · ${entry.clientId}` : ''}</span><small>{new Date(entry.createdAt).toLocaleString()}</small></div>)}{entries.length === 0 && <p className="muted">기록이 없습니다.</p>}</section>; }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
