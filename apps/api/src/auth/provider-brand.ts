export type BrandProvider = 'google' | 'kakao';

interface Brand {
  label: string;
  mark: string;
}

// Google: 표준 4색 "G"만 허용 — 크기/색상 변경 및 단색 버전 금지.
// https://developers.google.com/identity/branding-guidelines
const GOOGLE_MARK = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18l-7.35-5.7C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07l-7.35 5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64l7.11 5.52c4.16-3.83 6.56-9.47 6.56-16.17z"/></svg>`;

// Kakao: 말풍선 심볼 필수(생략·변형·색상 변경 금지), 레이블은 "카카오 로그인" 또는 "로그인".
// https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide
const KAKAO_MARK = `<svg class="mark" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path fill="#000000" d="M9 1C4.03 1 0 4.13 0 7.99c0 2.5 1.68 4.69 4.2 5.94-.14.5-.9 3.2-.93 3.4 0 0-.02.16.09.22.1.06.23.01.23.01.28-.04 3.3-2.17 3.83-2.54.52.07 1.05.11 1.58.11 4.97 0 9-3.13 9-6.99C18 4.13 13.97 1 9 1z"/></svg>`;

const BRANDS: Record<BrandProvider, Brand> = {
  google: { label: 'Google 계정으로 로그인', mark: GOOGLE_MARK },
  kakao: { label: '카카오 로그인', mark: KAKAO_MARK },
};

const PROVIDER_NAMES: Record<BrandProvider, string> = { google: 'Google', kakao: '카카오' };

export function providerName(provider: string): string {
  return PROVIDER_NAMES[provider as BrandProvider] ?? provider;
}

export function isBrandProvider(provider: string): provider is BrandProvider {
  return provider === 'google' || provider === 'kakao';
}

// 버튼 밖(목록 행 등)에서 쓰는 프로바이더 마크. 심볼 자체는 버튼과 동일한 것을 재사용한다.
export function providerMarkCss(): string {
  return `.pmark{width:18px;height:18px;border-radius:6px;display:grid;place-items:center;flex:none;overflow:hidden}.pmark .mark{width:18px;height:18px;display:block}.pmark--google{background:#fff;border:1px solid #dadce0}.pmark--kakao{background:#fee500}.pmark--kakao .mark{width:12px;height:12px}`;
}

export function providerMark(provider: string): string {
  if (!isBrandProvider(provider)) return `<span class="pmark" aria-hidden="true"></span>`;
  return `<span class="pmark pmark--${provider}" aria-hidden="true">${BRANDS[provider].mark}</span>`;
}

export function providerButtonCss(): string {
  return `.oauth{display:flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;width:100%;height:40px;padding:0 12px;margin:0 0 10px;text-decoration:none;font-size:14px;line-height:20px;font-weight:500}.oauth .mark{flex:none;width:18px;height:18px}.oauth .label{white-space:nowrap}.oauth-google{background:#fff;border:1px solid #747775;border-radius:4px;color:#1f1f1f;font-family:'Google Sans',Roboto,system-ui,-apple-system,'Segoe UI',sans-serif}.oauth-kakao{background:#fee500;border:0;border-radius:12px;color:rgba(0,0,0,.85);font-family:system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}.oauth-unconfigured{opacity:.45}`;
}

export function providerButton(
  provider: BrandProvider,
  href: string,
  options: { configured?: boolean } = {},
): string {
  const brand = BRANDS[provider];
  const unconfigured = options.configured === false ? ' oauth-unconfigured' : '';
  return `<a class="oauth oauth-${provider}${unconfigured}" href="${href}">${brand.mark}<span class="label">${brand.label}</span></a>`;
}
