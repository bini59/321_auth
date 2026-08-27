// 계정 포털/로그인 화면의 공통 셸. admin 콘솔(apps/admin/src)과 같은 디자인 언어를 쓴다.
// 토큰은 apps/admin/src/theme.css, 컴포넌트 규칙은 apps/admin/src/style.css 에서 옮겨왔다.
import type { Response } from 'express';

const THEME_STORAGE_KEY = 'auth-client.theme';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** admin 과 분리된 키를 쓰는 FOUC 방지 스크립트. <head> 최상단에 인라인으로 넣는다. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

/** use-theme.ts 의 동작(localStorage + matchMedia 구독)을 그대로 옮긴 토글 런타임. */
export const THEME_TOGGLE_SCRIPT = `(function(){var KEY='${THEME_STORAGE_KEY}';var mq=matchMedia('(prefers-color-scheme: dark)');var group=document.querySelector('[data-theme-toggle]');
function read(){try{var v=localStorage.getItem(KEY);return v==='light'||v==='dark'||v==='system'?v:'system';}catch(e){return 'system';}}
function apply(){var p=read();document.documentElement.setAttribute('data-theme',p==='system'?(mq.matches?'dark':'light'):p);if(!group)return;Array.prototype.forEach.call(group.querySelectorAll('[role=radio]'),function(b){b.setAttribute('aria-checked',b.getAttribute('data-value')===p?'true':'false');});}
mq.addEventListener('change',apply);
if(group)group.addEventListener('click',function(e){var b=e.target.closest('[role=radio]');if(!b)return;try{localStorage.setItem(KEY,b.getAttribute('data-value'));}catch(err){}apply();});
apply();})();`;

const TOKENS_CSS = `:root{--bg:#0a0a0a;--panel:#0f0f0f;--panel-2:#141414;--raise:#191919;--border:#242424;--border-strong:#333333;--fg:#ededed;--fg-2:#a1a1a1;--fg-3:#6f6f6f;--accent:#3b82f6;--accent-fg:#ffffff;--accent-soft:rgba(59,130,246,.14);--ok:#38b26b;--warn:#d9a441;--danger:#e5484d;--danger-soft:rgba(229,72,77,.12);--shadow:0 12px 32px rgba(0,0,0,.55);--skel:#1c1c1c;--skel-hi:#262626;--seg-active:#2e2e2e;--seg-shadow:none;color-scheme:dark}
:root[data-theme='light']{--bg:#ffffff;--panel:#fafafa;--panel-2:#f4f4f4;--raise:#ffffff;--border:#e6e6e6;--border-strong:#d4d4d4;--fg:#111111;--fg-2:#5f5f5f;--fg-3:#8b8b8b;--accent:#0062d6;--accent-fg:#ffffff;--accent-soft:rgba(0,98,214,.1);--ok:#178a4c;--warn:#a36a00;--danger:#c62a2f;--danger-soft:rgba(198,42,47,.09);--shadow:0 12px 32px rgba(0,0,0,.12);--skel:#eeeeee;--skel-hi:#f7f7f7;--seg-active:#ffffff;--seg-shadow:0 1px 2px rgba(0,0,0,.1);color-scheme:light}
:root[data-theme] body,:root[data-theme] body *{transition:background-color .12s ease,border-color .12s ease,color .12s ease}`;

const BASE_CSS = `*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:Geist,ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
input,button,select,textarea{font-family:inherit}
input:focus-visible,button:focus-visible,a:focus-visible,label:focus-within{outline:2px solid var(--accent-soft);outline-offset:1px}
::placeholder{color:var(--fg-3)}
.mono{font-family:'Geist Mono',ui-monospace,SFMono-Regular,monospace}
.muted{color:var(--fg-2)}
.dim{color:var(--fg-3)}
.spacer{flex:1}
h1,h2,p{margin:0}`;

const COMPONENT_CSS = `.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;height:52px;padding:0 22px;border-bottom:1px solid var(--border);background:var(--bg)}
.brand{display:flex;align-items:center;gap:9px;min-width:0}
.brand-mark{width:24px;height:24px;border-radius:6px;background:var(--fg);color:var(--bg);display:grid;place-items:center;font-weight:700;font-size:12px;flex:none}
.brand-name{font-size:13px;font-weight:600;letter-spacing:-.01em}
.brand-host{font-size:11.5px;color:var(--fg-3)}
.avatar{width:28px;height:28px;border-radius:50%;background:var(--panel-2);border:1px solid var(--border);display:grid;place-items:center;font-size:11.5px;font-weight:600;color:var(--fg-2);overflow:hidden;flex:none}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.seg{display:flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:9px;background:var(--panel-2)}
.seg button{flex:1;height:26px;display:grid;place-items:center;padding:0;border:0;border-radius:6px;cursor:pointer;background:transparent;color:var(--fg-3)}
.seg button[aria-checked='true']{background:var(--seg-active);color:var(--fg);box-shadow:var(--seg-shadow)}
.page{max-width:620px;margin:0 auto;padding:30px 20px 90px}
.page-head{margin-bottom:16px}
.page-head h1{font-size:21px;font-weight:600;letter-spacing:-.02em}
.page-head p{margin-top:5px;color:var(--fg-2);font-size:13px}
.stack{display:grid;gap:12px}
.card{border:1px solid var(--border);border-radius:10px;background:var(--panel);overflow:hidden}
.card-head{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);font-size:13px;font-weight:500}
.card-body{padding:16px}
.card-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-top:1px solid var(--border);background:var(--panel-2)}
.rows{display:grid}
.row{display:flex;align-items:center;gap:11px;padding:11px 14px;border-bottom:1px solid var(--border);min-width:0}
.row:last-child{border-bottom:0}
.row-main{min-width:0;display:grid;gap:2px}
.row-title{font-size:13px}
.row-sub{font-size:11.5px;color:var(--fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-aside{margin-left:auto;text-align:right;font-size:11.5px;color:var(--fg-3);flex:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--border-strong);border-radius:8px;background:var(--raise);color:var(--fg);font-size:13px;cursor:pointer;white-space:nowrap;text-decoration:none}
.btn:hover{background:var(--panel-2);text-decoration:none}
.btn--sm{height:26px;padding:0 9px;font-size:12px;border-radius:6px;color:var(--fg-2)}
.btn--primary{background:var(--fg);color:var(--bg);border-color:transparent;font-weight:500}
.btn--primary:hover{opacity:.88;background:var(--fg)}
.btn--danger{border-color:var(--danger);background:var(--danger-soft);color:var(--danger)}
.btn--ghost{border-color:transparent;background:transparent;color:var(--fg-2)}
.btn--block{width:100%}
.field{display:grid;gap:6px}
.label{font-size:12px;color:var(--fg-2)}
.input{height:32px;padding:0 10px;border:1px solid var(--border-strong);border-radius:7px;background:var(--bg);color:var(--fg);font-size:13px;width:100%}
.input[readonly]{background:var(--panel-2);border-color:var(--border);color:var(--fg-2)}
.badge{display:inline-block;font-size:11.5px;padding:2px 8px;border-radius:20px;background:var(--panel-2);color:var(--fg-3)}
.badge--ok{background:var(--accent-soft);color:var(--accent)}
.dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--fg-3)}
.dot--ok{background:var(--ok);box-shadow:0 0 0 3px rgba(56,178,107,.16)}
.dot--warn{background:var(--warn)}
.hint{font-size:11.5px;color:var(--fg-3)}
.note{font-size:12px;color:var(--fg-3)}
.error{padding:9px 12px;border:1px solid var(--danger);border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:13px}
.empty{padding:22px 14px;text-align:center;font-size:12.5px;color:var(--fg-3)}
.centered{min-height:100vh;display:grid;place-items:center;padding:24px 20px}
.solo{width:100%}
.solo-card{border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:26px}
.solo-card h1{font-size:19px;font-weight:600;letter-spacing:-.02em}
.solo-card p{margin-top:6px;color:var(--fg-2);font-size:13.5px}
.solo-foot{display:flex;align-items:center;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid var(--border);color:var(--fg-3);font-size:12px}
.page-foot{display:flex;align-items:center;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);color:var(--fg-3);font-size:12px}`;

/** 로그인 화면 전용 셸. 상단바 아래 남은 높이를 좌측 340px 패널 + 우측 중앙 블록으로 채운다. */
const LOGIN_SHELL_CSS = `body{min-height:100vh;display:flex;flex-direction:column}
.lshell{flex:1;display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr)}
.lpanel{background:var(--panel);border-right:1px solid var(--border);padding:34px 30px;display:flex;flex-direction:column;gap:14px}
.lmark{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;font-size:13px;font-weight:700;flex:none;overflow:hidden}
.lmark img{width:34px;height:34px;border-radius:8px;object-fit:cover;display:block}
.lid{display:grid;gap:4px;min-width:0}
.lname{font-size:18px;font-weight:600;letter-spacing:-.02em}
.lhost{font-size:12.5px;color:var(--fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lfoot{border-top:1px solid var(--border);padding-top:14px;display:grid;gap:7px;font-size:12px;color:var(--fg-3)}
.lrow{display:flex;align-items:center;gap:7px;min-width:0}
.ltrunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lmain{display:grid;place-items:center;padding:34px 30px}
.lblock{width:100%;max-width:296px}
.lnotice{margin:0 0 16px;font-size:13px;color:var(--fg-2)}
.lbuttons{display:grid;gap:10px}
.lbuttons .oauth{margin:0}
@media (max-width:720px){.lshell{grid-template-columns:minmax(0,1fr)}.lpanel{border-right:0;border-bottom:1px solid var(--border)}}`;

export function loginShellCss(): string {
  return LOGIN_SHELL_CSS;
}

/**
 * 두 로그인 화면(`/client` 비로그인, `/login` 앱별)의 공통 레이아웃.
 * mark/footer/block 은 이미 이스케이프된 HTML 을 받는다.
 */
export function loginShell(options: {
  mark: string;
  name: string;
  host?: string;
  footer: string;
  notice: string;
  buttons: string;
  panelStyle?: string;
  block?: string;
}): string {
  const panelStyle = options.panelStyle ? ` style="${options.panelStyle}"` : '';
  const host = options.host ? `<span class="lhost mono">${escapeHtml(options.host)}</span>` : '';
  return `${topbar()}<main class="lshell">
<div class="lpanel"${panelStyle}>${options.mark}
<div class="lid"><span class="lname">${escapeHtml(options.name)}</span>${host}</div>
<span style="flex:1"></span>
<div class="lfoot">${options.footer}</div>
</div>
<div class="lmain"><div class="lblock">
<p class="lnotice">${escapeHtml(options.notice)}</p>${options.block ?? ''}
<div class="lbuttons">${options.buttons}</div>
</div></div>
</main>`;
}

export function portalCss(): string {
  return `${TOKENS_CSS}\n${BASE_CSS}\n${COMPONENT_CSS}`;
}

/** helmet 이 붙인 per-request nonce. 없으면 빈 문자열(테스트 하네스처럼 CSP 없는 환경). */
export function cspNonce(res: Response): string {
  const value = (res.locals as { cspNonce?: unknown } | undefined)?.cspNonce;
  return typeof value === 'string' ? value : '';
}

const SUN_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const SYSTEM_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
export const LOGOUT_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/></svg>`;
export const UPLOAD_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`;

/**
 * theme-toggle.tsx 와 같은 3단 세그먼트. 서버는 system 을 활성으로 그리고,
 * THEME_TOGGLE_SCRIPT 가 저장된 값으로 aria-checked 를 다시 맞춘다.
 */
export function themeToggle(): string {
  const options: Array<[string, string, string]> = [
    ['light', '라이트', SUN_ICON],
    ['dark', '다크', MOON_ICON],
    ['system', '시스템', SYSTEM_ICON],
  ];
  const buttons = options
    .map(([value, label, icon]) =>
      `<button type="button" role="radio" data-value="${value}" aria-checked="${value === 'system'}" title="${label}" aria-label="${label}">${icon}</button>`,
    )
    .join('');
  return `<div class="seg" role="radiogroup" aria-label="테마" data-theme-toggle>${buttons}</div>`;
}

export function avatar(url: string | null, name: string | null, size: number): string {
  const initial = escapeHtml((name || '?').slice(0, 1).toUpperCase());
  const style = ` style="width:${size}px;height:${size}px;font-size:${Math.max(11.5, Math.round(size / 2.6))}px"`;
  const inner = url ? `<img src="${escapeHtml(url)}" alt="프로필 사진">` : initial;
  return `<span class="avatar"${style}>${inner}</span>`;
}

export function topbar(options: { avatarUrl?: string | null; name?: string | null; signedIn?: boolean } = {}): string {
  const right = options.signedIn ? avatar(options.avatarUrl ?? null, options.name ?? null, 28) : '';
  return `<header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">A</span><span class="brand-name">계정</span><span class="brand-host mono">bini59.dev</span></div><div class="spacer"></div>${themeToggle()}${right}</header>`;
}

export function layout(options: {
  title: string;
  nonce: string;
  body: string;
  extraCss?: string;
  script?: string;
}): string {
  const nonceAttr = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : '';
  const script = options.script ? `<script${nonceAttr}>${options.script}</script>` : '';
  return `<!doctype html><html lang="ko"><head><script${nonceAttr}>${THEME_BOOT_SCRIPT}</script>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(options.title)}</title>` +
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">` +
    `<style>${portalCss()}${options.extraCss ?? ''}</style></head><body>${options.body}${script}</body></html>`;
}
