import { FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { authApi } from './api';
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

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    authApi.health().then(() => setApiStatus('정상')).catch(() => setApiStatus('확인 필요'));
    authApi.csrf().then(({ csrfToken: token }) => setCsrfToken(token)).catch(() => undefined);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const logout = async () => {
    await authApi.logout(csrfToken);
    window.location.assign('/admin/login');
  };

  return <div className="shell"><aside><div className="brand">AUTH<span>ADMIN</span></div><nav>{sections.map((item) => <button className={item === section ? 'active' : ''} key={item} onClick={() => { window.location.hash = item; }}>{item}</button>)}</nav><button className="logout" onClick={() => void logout()}>로그아웃</button></aside><main><header><div><p className="eyebrow">CENTRAL AUTHORITY</p><h1>{section}</h1></div><span className="status"><i /> API {apiStatus}</span></header><section className="card"><p className="eyebrow">ADMIN CONSOLE</p><h2>{section === 'overview' ? '운영 현황을 한 곳에서 확인합니다.' : section + ' 관리 영역'}</h2><p className="muted">관리자 인증 세션으로 보호된 운영 콘솔입니다.</p></section></main></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
