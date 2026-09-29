import { ENV, PROVIDERS, type ProviderName } from '../config/env';
import { providerButton, providerButtonCss } from './provider-brand';
import { THEME_TOGGLE_SCRIPT, escapeHtml, layout, loginShell, loginShellCss } from './portal-ui';

// 모든 서비스가 파비콘·헤더에 쓰는 공용 로고. img-src 가 이미 허용한 static 출처라 CSP 를 건드리지 않는다.
const SHARED_LOGO = `${ENV.staticOrigin}/logo/logo-128.png`;

export function renderLoginPage(
  client: { name: string; logo_url: string | null },
  clientId: string,
  returnTo: string,
  error?: string,
  nonce = '',
) {
  // 서비스 전용 logo_url 이 있으면 그것을, 없으면 공용 로고를 쓴다.
  const mark = `<span class="lmark" aria-hidden="true"><img src="${escapeHtml(client.logo_url || SHARED_LOGO)}" alt=""></span>`;
  const err = error
    ? `<div class="alert alert--error" role="alert">로그인할 수 없습니다 (${escapeHtml(error)})</div>`
    : '';
  const rt = encodeURIComponent(returnTo);
  const providerButtons = (Object.keys(PROVIDERS) as ProviderName[])
    .map((p) =>
      providerButton(p, `/login/${p}?client_id=${encodeURIComponent(clientId)}&return_to=${rt}`, {
        configured: Boolean(PROVIDERS[p].clientId),
      }),
    )
    .join('');

  let host = '';
  try {
    host = new URL(returnTo).host;
  } catch {
    host = '';
  }

  const body = loginShell({
    mark,
    name: client.name,
    footer: `<span class="lrow"><span class="dot dot--ok" aria-hidden="true"></span><span class="mono">auth.bini59.dev</span></span>` +
      `<span class="mono ltrunc" title="${escapeHtml(returnTo)}">→ ${escapeHtml(host || returnTo)}</span>`,
    notice: 'bini59.dev 계정으로 계속합니다.',
    block: err,
    buttons: providerButtons,
  });

  return layout({
    title: `로그인 · ${client.name}`,
    nonce,
    body,
    extraCss: `${providerButtonCss()}${loginShellCss()}`,
    script: THEME_TOGGLE_SCRIPT,
  });
}
