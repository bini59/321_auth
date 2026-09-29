import { describe, expect, it } from 'vitest';
import { ENV } from '../config/env';
import { renderLoginPage } from './login-page';

const CLIENT = { name: 'Archive', logo_url: null };

describe('renderLoginPage', () => {
  it('shows the return host', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('archive.bini59.dev');
  });

  it('uses the shared static logo when the client has none', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain(`<span class="lmark" aria-hidden="true"><img src="${ENV.staticOrigin}/logo/logo-128.png" alt="">`);
  });

  it('renders the logo when the client has one', () => {
    const html = renderLoginPage(
      { ...CLIENT, logo_url: 'https://static.example/logo.png' },
      'archive',
      'https://archive.bini59.dev/',
    );
    expect(html).toContain('https://static.example/logo.png');
    expect(html).toContain('<span class="lmark" aria-hidden="true"><img src="https://static.example/logo.png"');
    expect(html).not.toContain('/logo/logo-128.png');
  });

  it('keeps the branded provider buttons and carries client_id plus return_to', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('oauth-google');
    expect(html).toContain('oauth-kakao');
    expect(html).toContain('#fee500');
    expect(html).toContain('client_id=archive');
    expect(html).toContain(`return_to=${encodeURIComponent('https://archive.bini59.dev/home')}`);
  });

  it('lets the provider label inherit the brand colour and size instead of the generic .label rule', () => {
    expect(renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home')).toContain(
      '.oauth .label{white-space:nowrap;color:inherit;font-size:inherit}',
    );
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

  it('renders one centered card headed by the client name', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('<h1 class="ltitle">Archive에 로그인</h1>');
    expect(html).toContain('class="lcard"');
    expect(html).not.toContain('class="lpanel"');
  });

  it('shows where the user is sent back to, with the full URL as a tooltip', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/home');
    expect(html).toContain('→ archive.bini59.dev</span>');
    expect(html).toContain('title="https://archive.bini59.dev/home"');
    expect(html).toContain('bini59.dev 계정으로 계속합니다.');
  });

  it('puts the error above the provider buttons', () => {
    const html = renderLoginPage(CLIENT, 'archive', 'https://archive.bini59.dev/', 'access_denied');
    expect(html).toContain('access_denied');
    expect(html).toContain('role="alert"');
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
