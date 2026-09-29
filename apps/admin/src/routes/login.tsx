import { createFileRoute } from '@tanstack/react-router';
import { ThemeToggle } from '@bini59/design';
import { authApi } from '@/api';
import { BRAND } from '@/components/nav';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { return_to?: string; error?: string } => ({
    return_to: typeof search.return_to === 'string' ? search.return_to : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { return_to, error } = Route.useSearch();
  const returnTo = return_to || '/admin';

  return (
    <main className="login-page">
      <div className="login-inner">
        <div className="brand" style={{ padding: 0, marginBottom: 26 }}>
          <div className="brand-mark" style={{ width: 26, height: 26, borderRadius: 7, fontSize: 13 }}>A</div>
          <span className="brand-name" style={{ fontSize: 14 }}>{BRAND.name}</span>
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
          {error === 'forbidden' && <p className="error" style={{ marginTop: 14, marginBottom: 0 }} role="alert">관리자 권한이 있는 계정으로 로그인해주세요.</p>}
          <div className="login-foot">
            <span className="dot dot--ok" />
            {BRAND.host} 통합 인증
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
