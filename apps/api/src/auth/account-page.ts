import {
  isBrandProvider,
  providerButton,
  providerButtonCss,
  providerMark,
  providerMarkCss,
  providerName,
} from './provider-brand';
import { describeDevice, describeOrigin, relativeTime } from './session-view';
import {
  LOGOUT_ICON,
  THEME_TOGGLE_SCRIPT,
  UPLOAD_ICON,
  avatar as avatarEl,
  escapeHtml,
  layout,
  loginShell,
  loginShellCss,
  themeToggle,
  topbar,
} from './portal-ui';

export interface AccountMembershipView {
  clientId: string;
  clientName: string;
  themeColor: string | null;
  role: string;
  status: string;
  lastSeenAt: Date | string | null;
}

export interface AccountSessionView {
  id: string;
  current: boolean;
  lastSeenAt: number;
  ua: string;
  ip: string;
}

export interface AccountPageData {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  identities: Array<{ provider: string }>;
  profileCompleted: boolean;
  memberships: AccountMembershipView[];
  sessions: AccountSessionView[];
  authError?: string | null;
  notice?: string | null;
}

const LINKABLE_PROVIDERS = ['google', 'kakao'] as const;

/** auth_error 는 쿼리스트링에서 오므로 화이트리스트로만 문구를 고른다. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  identity_already_linked:
    '이 로그인 수단은 이미 다른 계정에 등록되어 있습니다. 두 계정을 하나로 합치려면 문의해주세요.',
  denied: '로그인 수단 연동이 취소되었습니다.',
};

const NOTICE_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  profile_saved: { tone: 'ok', text: '변경사항이 저장되었습니다.' },
  avatar_saved: { tone: 'ok', text: '프로필 사진이 저장되었습니다.' },
  name_invalid: { tone: 'error', text: '이름은 2–40자로 입력해주세요.' },
  avatar_invalid: {
    tone: 'error',
    text: '사진을 저장할 수 없습니다. PNG·JPEG·WebP 5MB 이하인지 확인해주세요.',
  },
  avatar_failed: { tone: 'error', text: '사진을 저장할 수 없습니다. 잠시 후 다시 시도해주세요.' },
  profile_failed: { tone: 'error', text: '변경사항을 저장할 수 없습니다.' },
};

function lookupMessage<T>(table: Record<string, T>, code: string | null | undefined): T | undefined {
  return code && Object.hasOwn(table, code) ? table[code] : undefined;
}

function noticeBanner(notice: string | null | undefined): string {
  const entry = lookupMessage(NOTICE_MESSAGES, notice);
  if (!entry) return '';
  return `<p class="alert alert--${entry.tone}" role="alert">${escapeHtml(entry.text)}</p>`;
}

const PROVIDER_HINTS: Record<string, string> = {
  google: 'Google 계정으로 로그인',
  kakao: '카카오 계정으로 로그인',
};

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** theme_color 는 운영자 입력이라 인라인 style 에 넣기 전에 hex 만 남긴다. */
function safeThemeColor(value: string | null): string | null {
  if (!value) return null;
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value.trim()) ? value.trim() : null;
}

const AVATAR_DROP_CSS = `.drop{position:relative;display:grid;place-items:center;width:72px;height:72px;border-radius:50%;cursor:pointer;flex:none}
.drop .avatar{width:72px;height:72px;font-size:28px}
.drop-over{position:absolute;inset:0;display:none;place-items:center;border:2px dashed var(--accent);border-radius:50%;background:var(--accent-soft);color:var(--accent)}
.drop.is-over .drop-over{display:grid}
.profile{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.profile-actions{display:flex;gap:8px;flex-wrap:wrap}
.fields{display:grid;gap:12px;margin-top:16px}
.form-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
.smark{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:#fff;font-size:11.5px;font-weight:700;flex:none;background:var(--fg-3)}
@media (max-width:520px){.row-aside{font-size:11.5px}}`;

const AVATAR_SCRIPT = `(function(){var form=document.querySelector('[data-avatar-form]');if(!form)return;var zone=form.querySelector('[data-drop]');var input=form.querySelector('input[type=file]');
function done(notice){location.replace('/client?notice='+encodeURIComponent(notice));}
function send(file){if(!file)return;var data=new FormData();data.append('file',file);fetch(form.action,{method:'POST',body:data,credentials:'same-origin'}).then(function(r){if(r.ok){done('avatar_saved');return;}done(r.status>=400&&r.status<500?'avatar_invalid':'avatar_failed');}).catch(function(){done('avatar_failed');});}
form.addEventListener('submit',function(e){e.preventDefault();send(input&&input.files&&input.files[0]);});
if(input)input.addEventListener('change',function(){send(input.files&&input.files[0]);});
if(!zone)return;
['dragenter','dragover'].forEach(function(type){zone.addEventListener(type,function(e){e.preventDefault();zone.classList.add('is-over');});});
['dragleave','dragend'].forEach(function(type){zone.addEventListener(type,function(){zone.classList.remove('is-over');});});
zone.addEventListener('drop',function(e){e.preventDefault();zone.classList.remove('is-over');var files=e.dataTransfer&&e.dataTransfer.files;send(files&&files[0]);});})();`;

function profileCard(account: AccountPageData, csrfQuery: string): string {
  const avatarUrl = safeAvatarUrl(account.avatarUrl);
  const notice = noticeBanner(account.notice);
  return `<section class="card"><div class="card-head">프로필</div><div class="card-body">
${notice ? `${notice}\n` : ''}<form class="profile" method="post" action="/account/avatar${csrfQuery}" enctype="multipart/form-data" data-avatar-form>
<label class="drop" data-drop title="프로필 사진 변경">${avatarEl(avatarUrl, account.name, 72)}<span class="drop-over">${UPLOAD_ICON}</span><input name="file" type="file" accept="image/png,image/jpeg,image/webp" hidden required></label>
<div><div class="profile-actions"><label class="btn btn--sm">사진 선택<input name="file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button class="btn btn--sm btn--primary" type="submit">저장</button></div>
<p class="hint" style="margin-top:8px">여기로 이미지를 끌어다 놓아도 됩니다. PNG로 저장, 최대 5MB.</p></div>
</form>
<form method="post" action="/account/profile${csrfQuery}">
<div class="fields">
<div class="field"><label class="label" for="account-name">이름</label><input class="input" id="account-name" name="name" value="${escapeHtml(account.name)}" required minlength="2" maxlength="40" autocomplete="name"></div>
<div class="field"><label class="label" for="account-email">이메일</label><input class="input mono" id="account-email" value="${escapeHtml(account.email || '이메일 없음')}" readonly></div>
</div>
<div class="form-foot"><button class="btn btn--primary" type="submit">변경사항 저장</button><span class="note">이메일은 로그인 수단에서 가져옵니다.</span></div>
</form>
</div></section>`;
}

function identitiesCard(account: AccountPageData): string {
  const linked = new Set(account.identities.map((identity) => identity.provider));
  const rows = LINKABLE_PROVIDERS.map((provider) => {
    const action = linked.has(provider)
      ? '<span class="badge badge--ok">연동됨</span>'
      : `<a class="btn btn--sm" href="/account/link/${provider}">연동하기</a>`;
    return `<div class="row">${providerMark(provider)}<div class="row-main"><span class="row-title">${escapeHtml(providerName(provider))}</span><span class="row-sub">${escapeHtml(PROVIDER_HINTS[provider])}</span></div><div class="row-aside">${action}</div></div>`;
  }).join('');
  const message = lookupMessage(AUTH_ERROR_MESSAGES, account.authError);
  const notice = message
    ? `<div class="card-body"><p class="alert alert--error" role="alert">${escapeHtml(message)}</p></div>`
    : '';
  return `<section class="card"><div class="card-head">로그인 수단</div>${notice}<div class="rows">${rows}</div></section>`;
}

function membershipsCard(memberships: AccountMembershipView[]): string {
  const rows = memberships.length === 0
    ? '<div class="empty">아직 연동된 앱이 없습니다.</div>'
    : memberships.map((membership) => {
      const color = safeThemeColor(membership.themeColor);
      const style = color ? ` style="background:${color}"` : '';
      const initial = escapeHtml((membership.clientName || membership.clientId).slice(0, 1).toUpperCase());
      const role = membership.status === 'suspended' ? '이용 정지' : escapeHtml(membership.role);
      return `<div class="row"><span class="smark"${style} aria-hidden="true">${initial}</span>` +
        `<div class="row-main"><span class="row-title">${escapeHtml(membership.clientName)}</span><span class="row-sub mono">${escapeHtml(membership.clientId)}</span></div>` +
        `<span class="badge">${role}</span>` +
        `<span class="row-aside">${escapeHtml(relativeTime(membership.lastSeenAt))}</span></div>`;
    }).join('');
  return `<section class="card"><div class="card-head">연동된 앱<span class="badge">${memberships.length}</span></div><div class="rows">${rows}</div>` +
    `<div class="card-foot"><span class="note">회원 자격 변경은 각 서비스 운영자에게 문의하세요.</span></div></section>`;
}

function sessionsCard(sessions: AccountSessionView[], csrfQuery: string): string {
  const rows = sessions.length === 0
    ? '<div class="empty">표시할 세션이 없습니다.</div>'
    : sessions.map((session) => {
      const label = session.current ? '현재 세션' : escapeHtml(relativeTime(session.lastSeenAt));
      return `<div class="row"><span class="dot ${session.current ? 'dot--ok' : ''}" aria-hidden="true"></span>` +
        `<div class="row-main"><span class="row-title">${escapeHtml(describeDevice(session.ua))}</span><span class="row-sub mono">${escapeHtml(describeOrigin(session.ip))}</span></div>` +
        `<span class="row-aside">${label}</span></div>`;
    }).join('');
  return `<section class="card"><div class="card-head">활성 세션<span class="badge">${sessions.length}</span></div><div class="rows">${rows}</div>` +
    `<div class="card-foot"><span class="note">낯선 기기가 보이면 모두 로그아웃한 뒤 다시 로그인하세요.</span><span class="spacer"></span>` +
    `<form method="post" action="/logout/all${csrfQuery}"><button class="btn btn--danger" type="submit">모든 기기에서 로그아웃</button></form></div></section>`;
}

export function renderAccountPage(account: AccountPageData, csrf: string, nonce = ''): string {
  const csrfQuery = `?csrf=${encodeURIComponent(csrf)}`;
  if (!account.profileCompleted) return renderOnboardingPage(account, csrf, nonce);

  const body = `${topbar({ signedIn: true, avatarUrl: safeAvatarUrl(account.avatarUrl), name: account.name })}
<main class="page">
<div class="page-head"><h1>계정</h1><p>bini59.dev 서비스 전체에 적용되는 프로필과 로그인 정보입니다.</p></div>
<div class="stack">${profileCard(account, csrfQuery)}${identitiesCard(account)}${membershipsCard(account.memberships)}${sessionsCard(account.sessions, csrfQuery)}</div>
<footer class="page-foot"><span class="mono">auth.bini59.dev</span><span class="spacer"></span>
<form method="post" action="/logout${csrfQuery}"><button class="btn btn--ghost btn--sm" type="submit">${LOGOUT_ICON}로그아웃</button></form></footer>
</main>`;

  return layout({
    title: '계정 · bini59.dev',
    nonce,
    body,
    extraCss: `${providerMarkCss()}${AVATAR_DROP_CSS}`,
    script: `${AVATAR_SCRIPT}${THEME_TOGGLE_SCRIPT}`,
  });
}

export function renderOnboardingPage(account: AccountPageData, csrf: string, nonce = ''): string {
  const csrfQuery = `?csrf=${encodeURIComponent(csrf)}`;
  const provider = account.identities[0]?.provider ?? '';
  const summary = isBrandProvider(provider)
    ? `<div style="display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--panel-2);margin:0 0 16px">${providerMark(provider)}<span class="mono" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(account.email || '이메일 없음')}</span><span class="spacer"></span><span class="badge badge--ok">인증됨</span></div>`
    : '';

  const body = `<main class="centered"><div class="solo" style="max-width:400px">
<div class="solo-card" style="padding:26px">
<h1>이름을 등록해주세요</h1>
<p style="margin-bottom:22px">서비스에 표시될 이름입니다. 나중에 계정 화면에서 바꿀 수 있습니다.</p>
${summary}${noticeBanner(account.notice)}
<form method="post" action="/account/profile${csrfQuery}">
<div class="field"><label class="label" for="onboarding-name">이름</label>
<input class="input" id="onboarding-name" name="name" placeholder="2–40자" required minlength="2" maxlength="40" autocomplete="name" autofocus style="height:34px"></div>
<button class="btn btn--primary btn--block" type="submit" style="height:36px;margin-top:14px">시작하기</button>
</form>
<div class="solo-foot"><span class="dot dot--warn" aria-hidden="true"></span><span>이름을 등록해야 서비스를 이용할 수 있습니다.</span></div>
</div>
<div style="display:flex;justify-content:center;margin-top:16px">${themeToggle()}</div>
</div></main>`;

  return layout({
    title: '이름 등록 · bini59.dev',
    nonce,
    body,
    extraCss: providerMarkCss(),
    script: THEME_TOGGLE_SCRIPT,
  });
}

export function renderAccountLoginPage(nonce = ''): string {
  const body = loginShell({
    mark: `<span class="lmark" style="background:var(--fg);color:var(--bg)" aria-hidden="true">A</span>`,
    name: 'bini59.dev 계정',
    host: 'auth.bini59.dev',
    footer: `<span>계정 설정 · 로그인 수단 · 활성 세션</span>` +
      `<span class="lrow"><span class="dot dot--ok" aria-hidden="true"></span><span class="mono">정상</span></span>`,
    notice: '계정 설정을 보려면 로그인하세요.',
    buttons: providerButton('google', '/client/login/google') + providerButton('kakao', '/client/login/kakao'),
  });

  return layout({
    title: '계정 · bini59.dev',
    nonce,
    body,
    extraCss: `${providerButtonCss()}${loginShellCss()}`,
    script: THEME_TOGGLE_SCRIPT,
  });
}
