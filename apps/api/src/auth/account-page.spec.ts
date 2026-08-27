import { describe, expect, it } from 'vitest';
import { renderAccountLoginPage, renderAccountPage, type AccountPageData } from './account-page';

const BASE: AccountPageData = {
  email: 'user@example.test',
  name: '홍길동',
  avatarUrl: null,
  identities: [{ provider: 'google' }],
  profileCompleted: true,
  memberships: [
    { clientId: 'archive', clientName: 'Archive', themeColor: '#3b82f6', role: 'member', status: 'active', lastSeenAt: null },
  ],
  sessions: [
    { id: 'sid-1', current: true, lastSeenAt: Date.now(), ua: 'Mozilla/5.0 (Macintosh) Chrome/124.0 Safari/537.36', ip: '203.0.113.7' },
  ],
};

function page(overrides: Partial<AccountPageData> = {}) {
  return renderAccountPage({ ...BASE, ...overrides }, 'csrf-token');
}

describe('renderAccountPage', () => {
  it('renders the four account cards', () => {
    const html = page();
    expect(html).toContain('프로필');
    expect(html).toContain('로그인 수단');
    expect(html).toContain('연동된 앱');
    expect(html).toContain('활성 세션');
  });

  it('keeps the existing form actions and carries the csrf token', () => {
    const html = page();
    expect(html).toContain('action="/account/profile?csrf=csrf-token"');
    expect(html).toContain('action="/account/avatar?csrf=csrf-token"');
    expect(html).toContain('action="/logout?csrf=csrf-token"');
    expect(html).toContain('action="/logout/all?csrf=csrf-token"');
  });

  it('uses theme tokens instead of the old hardcoded palette', () => {
    const html = page();
    expect(html).toContain('--accent');
    expect(html).not.toContain('#4f46e5');
    expect(html).not.toContain('#f4f5f7');
    expect(html).not.toContain('#6366f1');
    expect(html).not.toContain('#eef2ff');
  });

  it('offers linking for providers that are not connected yet', () => {
    const html = page();
    expect(html).toContain('연동됨');
    expect(html).toContain('href="/account/link/kakao"');
    expect(html).not.toContain('href="/account/link/google"');
  });

  it('escapes account values rather than interpolating them raw', () => {
    const html = page({ name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rejects a non-https avatar url', () => {
    expect(page({ avatarUrl: 'javascript:alert(1)' })).not.toContain('javascript:alert(1)');
    expect(page({ avatarUrl: 'https://static.example/a.png' })).toContain('https://static.example/a.png');
  });

  it('drops a theme_color that is not a plain hex value', () => {
    const html = page({
      memberships: [{ ...BASE.memberships[0], themeColor: 'red;background:url(javascript:alert(1))' }],
    });
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('switches to the onboarding screen when the name is missing', () => {
    const html = page({ profileCompleted: false, name: null });
    expect(html).toContain('이름을 등록해주세요');
    expect(html).toContain('시작하기');
    expect(html).not.toContain('활성 세션');
  });

  it('shows empty states instead of blank cards', () => {
    const html = page({ memberships: [], sessions: [] });
    expect(html).toContain('아직 연동된 앱이 없습니다.');
    expect(html).toContain('표시할 세션이 없습니다.');
  });

  it('adds the csp nonce to inline scripts only when one is supplied', () => {
    expect(renderAccountPage(BASE, 'csrf-token', 'n0nce')).toContain('<script nonce="n0nce">');
    expect(page()).toContain('<script>');
  });

  it('explains that the provider already belongs to another account', () => {
    const html = page({ authError: 'identity_already_linked' });
    expect(html).toContain('이미 다른 계정에 등록되어 있습니다');
    expect(html).toContain('role="alert"');
  });

  it('stays quiet when there is no auth error', () => {
    const html = page();
    expect(html).not.toContain('role="alert"');
  });

  it('ignores an auth_error value that is not a known code', () => {
    const html = page({ authError: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('onerror=alert(1)');
    expect(html).not.toContain('role="alert"');
  });

  it('confirms a saved profile in the profile card', () => {
    const html = page({ notice: 'profile_saved' });
    expect(html).toContain('변경사항이 저장되었습니다.');
    expect(html).toContain('class="alert alert--ok" role="alert"');
  });

  it('reports a rejected name so the user can correct it', () => {
    const html = page({ notice: 'name_invalid' });
    expect(html).toContain('이름은 2–40자로 입력해주세요.');
    expect(html).toContain('class="alert alert--error" role="alert"');
  });

  it('reports all avatar outcomes in the same place as the name outcomes', () => {
    expect(page({ notice: 'avatar_saved' })).toContain('프로필 사진이 저장되었습니다.');
    expect(page({ notice: 'avatar_invalid' })).toContain('PNG·JPEG·WebP 5MB 이하');
    expect(page({ notice: 'avatar_failed' })).toContain('사진을 저장할 수 없습니다. 잠시 후 다시 시도해주세요.');
  });

  it('ignores inherited whitelist properties', () => {
    const html = page({ notice: '__proto__' });
    expect(html).not.toContain('class="alert');
  });

  it('uses the same safe lookup for auth errors', () => {
    const html = page({ authError: '__proto__' });
    expect(html).not.toContain('class="alert');
  });

  it('reports a save that failed for reasons other than validation', () => {
    const html = page({ notice: 'profile_failed' });
    expect(html).toContain('변경사항을 저장할 수 없습니다.');
    expect(html).toContain('alert--error');
  });

  it('stays quiet when there is no notice', () => {
    expect(page()).not.toContain('class="alert');
  });

  it('ignores a notice value that is not a known code', () => {
    const html = page({ notice: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('onerror=alert(1)');
    expect(html).not.toContain('class="alert');
  });

  it('hands avatar feedback to the portal instead of a browser alert', () => {
    const html = page();
    expect(html).toContain("/client?notice='+encodeURIComponent(notice)");
    expect(html).not.toContain('alert(');
  });

  it('surfaces a rejected name on the onboarding screen too', () => {
    const html = page({ profileCompleted: false, name: null, notice: 'name_invalid' });
    expect(html).toContain('이름을 등록해주세요');
    expect(html).toContain('이름은 2–40자로 입력해주세요.');
    expect(html).toContain('role="alert"');
  });
});

describe('renderAccountLoginPage', () => {
  it('keeps the branded provider buttons untouched', () => {
    const html = renderAccountLoginPage();
    expect(html).toContain('oauth-google');
    expect(html).toContain('oauth-kakao');
    expect(html).toContain('Google 계정으로 로그인');
    expect(html).toContain('카카오 로그인');
    expect(html).toContain('#fee500');
    expect(html).toContain('href="/client/login/google"');
  });

  it('renders the theme toggle as an accessible radiogroup', () => {
    const html = renderAccountLoginPage();
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked');
  });

  it('uses the split shell instead of a floating card', () => {
    const html = renderAccountLoginPage();
    expect(html).toContain('class="lshell"');
    expect(html).toContain('class="lpanel"');
    expect(html).toContain('class="lmain"');
    expect(html).not.toContain('class="solo-card"');
    expect(html).not.toContain('class="centered"');
  });

  it('labels the panel with the account identity and a healthy status', () => {
    const html = renderAccountLoginPage();
    expect(html).toContain('bini59.dev 계정');
    expect(html).toContain('auth.bini59.dev');
    expect(html).toContain('계정 설정 · 로그인 수단 · 활성 세션');
    expect(html).toContain('dot dot--ok');
    expect(html).toContain('정상');
  });
});
