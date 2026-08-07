// apps/admin/src/sections/login.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { authApi } from '../api';
import { ThemeToggle } from '../theme-toggle';

export function LoginPage({ brandName = 'Auth Admin', host = 'bini59.dev' }: { brandName?: string; host?: string }) {
  const [password, setPassword] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [error, setError] = useState('');
  const returnTo = new URLSearchParams(window.location.search).get('return_to') || '/admin';

  useEffect(() => {
    authApi.csrf()
      .then(({ csrfToken: token }) => setCsrfToken(token))
      .catch(() => setError('로그인 준비에 실패했습니다.'));
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

  return (
    <main className="login-page">
      <div className="login-inner">
        <div className="brand" style={{ padding: 0, marginBottom: 26 }}>
          <div className="brand-mark" style={{ width: 26, height: 26, borderRadius: 7, fontSize: 13 }}>A</div>
          <span className="brand-name" style={{ fontSize: 14 }}>{brandName}</span>
        </div>

        <form className="login-card" onSubmit={(event) => void submit(event)}>
          <h1>관리자 로그인</h1>
          <p>운영 콘솔에 접근하려면 관리자 비밀번호가 필요합니다.</p>
          <label htmlFor="admin-password">비밀번호</label>
          <input
            id="admin-password"
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} type="submit" disabled={!csrfToken}>
            로그인
          </button>
          {error && <p className="error" style={{ marginTop: 14, marginBottom: 0 }} role="alert">{error}</p>}
          <div className="login-foot">
            <span className="dot dot--ok" />
            {host} 통합 인증
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <div style={{ width: 120 }}><ThemeToggle /></div>
        </div>
      </div>
    </main>
  );
}
