import { FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { authApi, type AdminOverview, type DeletionQueueItem } from './api';
import { formatAdminCount, serviceStatusLabel } from './view-model';
import './style.css';

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
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    authApi.health().then(() => setApiStatus('정상')).catch(() => setApiStatus('확인 필요'));
    authApi.csrf().then(({ csrfToken: token }) => setCsrfToken(token)).catch(() => undefined);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    setDataError('');
    if (section === 'overview') {
      authApi.overview().then(setOverview).catch(() => setDataError('운영 현황을 불러오지 못했습니다.'));
    }
    if (section === 'operations') {
      authApi.deletionQueue().then(setDeletionQueue).catch(() => setDataError('탈퇴 대기 목록을 불러오지 못했습니다.'));
    }
  }, [section]);

  const logout = async () => {
    await authApi.logout(csrfToken);
    window.location.assign('/admin/login');
  };

  return <div className="shell"><aside><div className="brand">AUTH<span>ADMIN</span></div><nav>{sections.map((item) => <button className={item === section ? 'active' : ''} key={item} onClick={() => { window.location.hash = item; }}>{item}</button>)}</nav><button className="logout" onClick={() => void logout()}>로그아웃</button></aside><main><header><div><p className="eyebrow">CENTRAL AUTHORITY</p><h1>{section}</h1></div><span className="status"><i /> API {apiStatus}</span></header>{dataError && <p className="error" role="alert">{dataError}</p>}{section === 'overview' && <OverviewPanel data={overview} />}{section === 'operations' && <OperationsPanel items={deletionQueue} />}{!['overview', 'operations'].includes(section) && <section className="card"><p className="eyebrow">ADMIN CONSOLE</p><h2>{section} 관리 영역</h2><p className="muted">이 영역은 다음 운영 기능에서 제공합니다.</p></section>}</main></div>;
}

function OverviewPanel({ data }: { data: AdminOverview | null }) {
  if (!data) return <section className="card"><p className="muted">운영 현황을 불러오는 중입니다...</p></section>;
  const cards = [['사용자', data.counts.users], ['활성 세션', data.counts.activeSessions], ['Client', data.counts.clients], ['멤버십', data.counts.memberships], ['탈퇴 대기', data.counts.deletionRequests]];
  return <><div className="metrics">{cards.map(([label, value]) => <section className="metric card" key={String(label)}><p className="eyebrow">{label}</p><strong>{formatAdminCount(value as number | null)}</strong></section>)}</div><section className="card services"><p className="eyebrow">SERVICE HEALTH</p><div className="service-grid">{Object.entries(data.services).map(([name, status]) => <div key={name}><span className={`service-dot ${status}`} />{name}<b>{serviceStatusLabel(status)}</b></div>)}</div></section></>;
}

function OperationsPanel({ items }: { items: DeletionQueueItem[] }) {
  return <section className="card"><div className="panel-heading"><div><p className="eyebrow">DELETION QUEUE</p><h2>탈퇴 대기 항목</h2></div><span className="muted">최근 {items.length}건</span></div>{items.length === 0 ? <p className="muted">대기 중인 탈퇴 요청이 없습니다.</p> : <div className="table-wrap"><table><thead><tr><th>사용자 ID</th><th>요청 시각</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.userId}-${item.requestedAt}`}><td>{item.userId}</td><td>{new Date(item.requestedAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
