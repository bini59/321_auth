import { PROVIDERS, type ProviderName } from '../config/env';
import { providerButton, providerButtonCss } from './provider-brand';
import { THEME_TOGGLE_SCRIPT, escapeHtml, layout, loginShell, loginShellCss } from './portal-ui';

export function renderLoginPage(
  client: { name: string; logo_url: string | null; theme_color: string | null },
  clientId: string,
  returnTo: string,
  error?: string,
  nonce = '',
) {
  // theme_color 는 운영자 입력이라 인라인 style 에 넣기 전에 hex 만 남긴다.
  const themeColor = client.theme_color && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(client.theme_color.trim())
    ? client.theme_color.trim()
    : 'var(--accent)';
  const mark = client.logo_url
    ? `<span class="lmark" aria-hidden="true"><img src="${escapeHtml(client.logo_url)}" alt=""></span>`
    : `<span class="lmark" style="background:var(--panel-2);border:1px solid var(--border);color:var(--fg-2)" aria-hidden="true">${escapeHtml((client.name || '?').slice(0, 1).toUpperCase())}</span>`;
  const err = error
    ? `<div style="padding:9px 12px;border:1px solid var(--danger);border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:13px;margin:0 0 16px">로그인할 수 없습니다 (${escapeHtml(error)})</div>`
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
    // client 색은 좌측 패널 상단 경계 한 줄에만 쓴다.
    panelStyle: `border-top:2px solid ${themeColor}`,
    mark,
    name: client.name,
    host,
    footer: `<span class="lrow"><span class="dot dot--ok" aria-hidden="true"></span><span class="mono">auth.bini59.dev</span></span>` +
      `<span class="mono ltrunc">→ ${escapeHtml(returnTo)}</span>`,
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
