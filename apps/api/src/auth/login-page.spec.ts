import { describe, expect, it } from 'vitest';
import { renderLoginPage } from './login-page';

const CLIENT = { name: 'Archive', logo_url: null, theme_color: '#3b82f6' };

describe('renderLoginPage', () => {
  it('applies the client theme_color to the panel top border only', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('border-top:2px solid #3b82f6');
  });

  it('uses the client colour nowhere but that one border', () => {
    // 토큰 값과 겹치지 않는 색이라 등장 횟수가 곧 client 색 사용 횟수다.
    const html = renderLoginPage({ ...CLIENT, theme_color: '#ff00aa' }, 'archive', 'https://archive.bini59.dev/');
    expect(html.match(/#ff00aa/g)).toHaveLength(1);
  });

  it('falls back to the accent token when theme_color is missing', () => {
    const html = renderLoginPage({ ...CLIENT, theme_color: null }, 'archive', 'https://archive.bini59.dev/');
    expect(html).toContain('border-top:2px solid var(--accent)');
  });

  it('refuses a theme_color that is not a plain hex value', () => {
    const html = renderLoginPage(
      { ...CLIENT, theme_color: 'red;background:url(javascript:alert(1))' },
      'archive',
      'https://archive.bini59.dev/',
    );
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('border-top:2px solid var(--accent)');
  });

  it('shows the return host and the first-letter mark when there is no logo', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('archive.bini59.dev');
    expect(html).toContain('>A</span>');
  });

  it('renders the logo when the client has one', () => {
    const html = renderLoginPage(
      { ...CLIENT, logo_url: 'https://static.example/logo.png' },
      'archive',
      'https://archive.bini59.dev/',
    );
    expect(html).toContain('https://static.example/logo.png');
    expect(html).toContain('<span class="lmark" aria-hidden="true"><img src="https://static.example/logo.png"');
  });

  it('keeps the branded provider buttons and carries client_id plus return_to', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('oauth-google');
    expect(html).toContain('oauth-kakao');
    expect(html).toContain('#fee500');
    expect(html).toContain('client_id=archive');
    expect(html).toContain(`return_to=${encodeURIComponent('https://archive.bini59.dev/home')}`);
  });

  it('escapes the client name and the error code', () => {
    const html = renderLoginPage(
      { ...CLIENT, name: '<script>alert(1)</script>' },
      'archive',
      'https://archive.bini59.dev/',
      '<img onerror=alert(1)>',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('uses the split shell instead of a floating card', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('class="lshell"');
    expect(html).toContain('class="lmain"');
    expect(html).not.toContain('class="solo-card"');
    expect(html).not.toContain('class="centered"');
  });

  it('shows the return_to target in the panel footer', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('→ https://archive.bini59.dev/home');
    expect(html).toContain('bini59.dev 계정으로 계속합니다.');
  });

  it('puts the error above the provider buttons', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/', 'access_denied');
    expect(html).toContain('access_denied');
    expect(html.indexOf('access_denied')).toBeLessThan(html.indexOf('class="lbuttons"'));
  });

  it('drops the legacy purple palette in favour of tokens', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/');
    expect(html).not.toContain('#4f46e5');
    expect(html).not.toContain('#f4f5f7');
    expect(html).toContain('--panel');
  });

  it('nonces the inline theme script when a nonce is supplied', () => {
    expect(renderLoginPage(CLIENT, 'archive', 'https://a.bini59.dev/', undefined, 'n0nce')).toContain('<script nonce="n0nce">');
  });
});
