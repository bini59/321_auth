import { FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { authApi, type AdminAudit, type AdminClient, type AdminMembership, type AdminOverview, type AdminUser, type AdminUserDetail, type DeletionQueueItem } from './api';
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
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);
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
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    authApi.health().then(() => setApiStatus('정상')).catch(() => setApiStatus('확인 필요'));
    authApi.csrf().then(({ csrfToken: token }) => setCsrfToken(token)).catch(() => undefined);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (section === 'overview') authApi.overview().then(setOverview).catch(() => setError('운영 현황을 불러오지 못했습니다.'));
    if (section === 'users') authApi.users(search).then(setUsers).catch(() => setError('사용자 목록을 불러오지 못했습니다.'));
    if (section === 'operations') authApi.audit().then(setAudit).catch(() => setError('감사 기록을 불러오지 못했습니다.'));
    if (section === 'operations') authApi.deletionQueue().then(setDeletionQueue).catch(() => setError('탈퇴 대기 목록을 불러오지 못했습니다.'));
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

  return <div className="shell"><aside><div className="brand">AUTH<span>ADMIN</span></div><nav>{sections.map((item) => <button className={item === section ? 'active' : ''} key={item} onClick={() => { window.location.hash = item; }}>{item}</button>)}</nav><button className="logout" onClick={() => void logout()}>로그아웃</button></aside><main><header><div><p className="eyebrow">CENTRAL AUTHORITY</p><h1>{section}</h1></div><span className="status"><i /> API {apiStatus}</span></header>{error && <p className="error" role="alert">{error}</p>}{section === 'overview' ? <OverviewPanel data={overview} /> : section === 'users' ? <UsersPanel users={users} selected={selected} search={search} onSearch={setSearch} onOpen={openUser} onMembership={updateMembership} onRevoke={revokeSessions} /> : section === 'operations' ? <><AuditPanel entries={audit} /><OperationsPanel items={deletionQueue} /></> : section === 'clients' ? <Clients csrfToken={csrfToken} /> : <section className="card"><p className="eyebrow">ADMIN CONSOLE</p><h2>{section} 관리 영역</h2><p className="muted">관리자 인증 세션으로 보호된 운영 콘솔입니다.</p></section>}</main></div>;
}

function OverviewPanel({ data }: { data: AdminOverview | null }) { return <section className="card"><p className="eyebrow">OPERATIONS OVERVIEW</p><h2>운영 현황</h2><div className="metric-grid"><strong>사용자 {data?.userCount ?? '확인 필요'}</strong><strong>클라이언트 {data?.clientCount ?? '확인 필요'}</strong><strong>활성 멤버십 {data?.activeMembershipCount ?? '확인 필요'}</strong><strong>정지 멤버십 {data?.suspendedMembershipCount ?? '확인 필요'}</strong></div><p className="muted">Postgres: {data?.services.postgres ?? '확인 필요'} · Redis: {data?.services.redis ?? '확인 필요'}</p></section>; }

function OperationsPanel({ items }: { items: DeletionQueueItem[] }) { return <section className="card audit-list"><p className="eyebrow">DELETION QUEUE</p><h2>탈퇴 대기 항목</h2>{items.length === 0 ? <p className="muted">대기 중인 탈퇴 요청이 없습니다.</p> : items.map((item) => <div className="audit-row" key={`${item.userId}-${item.requestedAt}`}><strong>{item.userId}</strong><small>{new Date(item.requestedAt).toLocaleString()}</small></div>)}</section>; }

function UsersPanel({ users, selected, search, onSearch, onOpen, onMembership, onRevoke }: { users: AdminUser[]; selected: AdminUserDetail | null; search: string; onSearch: (value: string) => void; onOpen: (user: AdminUser) => void; onMembership: (membership: AdminMembership, update: { role?: string; status?: string }) => void; onRevoke: () => void }) {
  return <div className="users-layout"><section className="card user-list"><input aria-label="사용자 검색" placeholder="이름, 이메일 또는 ID 검색" value={search} onChange={(event) => onSearch(event.target.value)} />{users.map((user) => <button className={selected?.userId === user.userId ? 'user-row active' : 'user-row'} key={user.userId} onClick={() => onOpen(user)}><strong>{user.name || '(이름 없음)'}</strong><span>{user.email || '이메일 없음'}</span><small>{user.providerCount} providers · {user.membershipCount} memberships</small></button>)}{users.length === 0 && <p className="muted">사용자가 없습니다.</p>}</section>{selected ? <section className="card user-detail"><div className="detail-head"><div><p className="eyebrow">USER DETAIL</p><h2>{selected.name || '(이름 없음)'}</h2><p className="muted">{selected.email || '이메일 없음'} · {selected.userId}</p></div><button className="danger" onClick={onRevoke}>모든 세션 폐기</button></div><h3>Provider</h3><p>{selected.identities.map((identity) => `${identity.provider} (${identity.providerUserId})`).join(', ') || '연결된 Provider 없음'}</p><h3>멤버십</h3>{selected.memberships.map((membership) => <div className="membership-row" key={membership.clientId}><div><strong>{membership.clientName}</strong><small>{membership.clientId}</small></div><select aria-label={`${membership.clientName} 상태`} value={membership.status} onChange={(event) => onMembership(membership, { status: event.target.value })}><option value="active">active</option><option value="suspended">suspended</option></select><select aria-label={`${membership.clientName} 역할`} value={membership.role} onChange={(event) => onMembership(membership, { role: event.target.value })}><option value="member">member</option><option value="admin">admin</option><option value="owner">owner</option></select></div>)}</section> : <section className="card"><p className="muted">왼쪽에서 사용자를 선택하세요.</p></section>}</div>;
}

function AuditPanel({ entries }: { entries: AdminAudit[] }) { return <section className="card audit-list"><p className="eyebrow">AUDIT LOG</p><h2>관리 작업 기록</h2>{entries.map((entry) => <div className="audit-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.userId || 'system'}{entry.clientId ? ` · ${entry.clientId}` : ''}</span><small>{new Date(entry.createdAt).toLocaleString()}</small></div>)}{entries.length === 0 && <p className="muted">기록이 없습니다.</p>}</section>; }

function Clients({ csrfToken }: { csrfToken: string }) {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ client_id: '', name: '', allowed_origins: '', default_redirect: '', auto_provision: true, onboarding_path: '' });
  const load = () => authApi.clients().then(setClients).catch(() => setNotice('클라이언트 목록을 불러오지 못했습니다.'));
  useEffect(() => { void load(); }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setNotice('');
    try { const result = await authApi.createClient({ ...form, allowed_origins: form.allowed_origins.split(',').map((x) => x.trim()), onboarding_path: form.onboarding_path || null }, csrfToken); setNotice(`생성됨. 새 secret: ${result.secret}`); setForm({ client_id: '', name: '', allowed_origins: '', default_redirect: '', auto_provision: true, onboarding_path: '' }); await load(); } catch { setNotice('생성에 실패했습니다. 입력값을 확인하세요.'); }
  };
  const toggle = async (client: AdminClient) => { await authApi.setClientActive(client.client_id, !client.is_active, csrfToken); await load(); };
  const edit = async (client: AdminClient) => { const name = window.prompt('클라이언트 이름', client.name); if (!name) return; const origins = window.prompt('허용 origin (쉼표로 구분)', client.allowed_origins.join(', ')); const redirect = window.prompt('기본 redirect', client.default_redirect); if (!origins || !redirect) return; try { await authApi.updateClient(client.client_id, { name, allowed_origins: origins.split(',').map((x) => x.trim()), default_redirect: redirect, auto_provision: client.auto_provision, onboarding_path: client.onboarding_path }, csrfToken); await load(); } catch { setNotice('수정에 실패했습니다. 입력값을 확인하세요.'); } };
  const rotate = async (client: AdminClient) => { const result = await authApi.rotateClientSecret(client.client_id, csrfToken); setNotice(`${client.client_id} 새 secret: ${result.secret}`); };
  return <div className="clients"><section className="card"><p className="eyebrow">CLIENT REGISTRY</p><h2>클라이언트 등록</h2><form className="client-form" onSubmit={(event) => void create(event)}><input required placeholder="client_id" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} /><input required placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input required placeholder="허용 origin (쉼표로 구분)" value={form.allowed_origins} onChange={(e) => setForm({ ...form, allowed_origins: e.target.value })} /><input required placeholder="기본 redirect" value={form.default_redirect} onChange={(e) => setForm({ ...form, default_redirect: e.target.value })} /><input placeholder="온보딩 path" value={form.onboarding_path} onChange={(e) => setForm({ ...form, onboarding_path: e.target.value })} /><label><input type="checkbox" checked={form.auto_provision} onChange={(e) => setForm({ ...form, auto_provision: e.target.checked })} /> 자동 프로비저닝</label><button className="primary" type="submit" disabled={!csrfToken}>등록</button></form>{notice && <p className="notice" role="status">{notice}</p>}</section><section className="card"><h2>등록된 클라이언트</h2><div className="client-list">{clients.map((client) => <article className={client.is_active ? 'client-row' : 'client-row inactive'} key={client.client_id}><div><strong>{client.name}</strong><span>{client.client_id} · {client.is_active ? '활성' : '비활성'}</span><small>{client.allowed_origins.join(', ')}</small></div><div className="client-actions"><button onClick={() => void edit(client)}>수정</button><button onClick={() => void toggle(client)}>{client.is_active ? '비활성화' : '활성화'}</button><button onClick={() => void rotate(client)}>secret 재발급</button></div></article>)}</div></section></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
