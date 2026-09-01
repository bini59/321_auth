// apps/admin/src/sections/login.tsx
import { useEffect, useState } from 'react';
import { authApi } from '../api';
import { ThemeToggle } from '../theme-toggle';

export function LoginPage({ brandName = 'Auth Admin', host = 'bini59.dev' }: { brandName?: string; host?: string }) {
  const [error, setError] = useState('');
  const returnTo = new URLSearchParams(window.location.search).get('return_to') || '/admin';

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'forbidden') {
      setError('관리자 권한이 있는 계정으로 로그인해주세요.');
    }
  }, []);

  return (
    <main className="login-page">
      <div className="login-inner">
        <div className="brand" style={{ padding: 0, marginBottom: 26 }}>
          <div className="brand-mark" style={{ width: 26, height: 26, borderRadius: 7, fontSize: 13 }}>A</div>
          <span className="brand-name" style={{ fontSize: 14 }}>{brandName}</span>
        </div>

        <div className="login-card">
          <h1>관리자 로그인</h1>
          <p>운영 콘솔에 접근하려면 관리자 계정으로 로그인하세요.</p>
          <button className="btn btn--primary btn--block" type="button" onClick={() => authApi.adminLogin('google', returnTo)}>
            Google로 로그인
          </button>
          <button className="btn btn--block" style={{ marginTop: 10 }} type="button" onClick={() => authApi.adminLogin('kakao', returnTo)}>
            카카오로 로그인
          </button>
          {error && <p className="error" style={{ marginTop: 14, marginBottom: 0 }} role="alert">{error}</p>}
          <div className="login-foot">
            <span className="dot dot--ok" />
            {host} 통합 인증
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <div style={{ width: 120 }}><ThemeToggle /></div>
        </div>
      </div>
    </main>
  );
}
