import { providerButton, providerButtonCss } from './provider-brand';

export interface AccountPageData {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  identities: Array<{ provider: string }>;
  profileCompleted: boolean;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function css() {
  return `body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#111827;margin:0;padding:24px}.card{max-width:520px;margin:5vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;box-shadow:0 10px 30px #0000000d}header{display:flex;justify-content:space-between;align-items:start}h1{margin:4px 0 24px;font-size:24px}h2{font-size:16px;margin:28px 0 12px}.eyebrow{color:#6366f1;font-size:12px;font-weight:700;margin:0}.profile{display:flex;gap:16px;align-items:center;margin-bottom:24px}.avatar{width:72px;height:72px;border-radius:50%;background:#eef2ff;color:#4f46e5;display:grid;place-items:center;font-size:28px;font-weight:700;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.button{display:block;width:100%;box-sizing:border-box;border:0;border-radius:8px;background:#4f46e5;color:#fff;padding:11px 14px;text-align:center;text-decoration:none;cursor:pointer;font:inherit;margin:8px 0}.button.small{display:inline-block;width:auto;font-size:13px;padding:8px 10px}.link{border:0;background:none;color:#6b7280;cursor:pointer}.hint,p{color:#6b7280;font-size:13px}.hint{margin:6px 0}label{display:block;font-size:13px;font-weight:600;margin:14px 0}input:not([type=file]){display:block;width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #d1d5db;border-radius:8px;padding:10px;font:inherit}input[readonly]{background:#f9fafb}.provider{display:inline-block;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;color:#374151;text-decoration:none;margin:4px 6px 4px 0;text-transform:capitalize}.provider.linked{background:#f0fdf4;border-color:#86efac;color:#166534}.required{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px;color:#9a3412;font-size:13px}`;
}

export function renderAccountLoginPage() {
  const buttons = providerButton('google', '/client/login/google') + providerButton('kakao', '/client/login/kakao');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>계정 · bini59.dev</title><style>${css()}${providerButtonCss()}</style></head><body><main class="card"><h1>bini59.dev 계정</h1><p>계정 설정을 보려면 로그인하세요.</p>${buttons}</main></body></html>`;
}

export function renderAccountPage(account: AccountPageData, csrf: string) {
  const avatar = safeAvatarUrl(account.avatarUrl);
  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" alt="프로필 사진">`
    : escapeHtml((account.name || '?').slice(0, 1).toUpperCase());
  const linked = new Set(account.identities.map((identity) => identity.provider));
  const providers = ['google', 'kakao'].map((provider) => linked.has(provider)
    ? `<span class="provider linked">${provider} 연동됨</span>`
    : `<a class="provider" href="/account/link/${provider}">${provider} 연동하기</a>`).join('');
  const required = account.profileCompleted ? '' : '<p class="required">서비스를 이용하려면 이름을 먼저 등록해주세요.</p>';
  const csrfQuery = `?csrf=${encodeURIComponent(csrf)}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>내 계정 · bini59.dev</title><style>${css()}</style></head><body><main class="card"><header><div><p class="eyebrow">bini59.dev</p><h1>내 계정</h1></div><form method="post" action="/logout${csrfQuery}"><button class="link" type="submit">로그아웃</button></form></header>${required}<section class="profile"><div class="avatar">${avatarHtml}</div><div><form method="post" action="/account/avatar${csrfQuery}" enctype="multipart/form-data"><label class="button small">프로필 사진 변경<input name="file" type="file" accept="image/png,image/jpeg,image/webp" hidden required></label><button class="button small" type="submit">사진 저장</button></form><p class="hint">PNG로 저장됩니다. 최대 5MB</p></div></section><form method="post" action="/account/profile${csrfQuery}"><label>이름<input name="name" value="${escapeHtml(account.name)}" required minlength="2" maxlength="40"></label><label>이메일<input value="${escapeHtml(account.email || '이메일 없음')}" readonly></label><button class="button" type="submit">저장</button></form><section><h2>로그인 연동</h2><div>${providers}</div></section></main></body></html>`;
}
