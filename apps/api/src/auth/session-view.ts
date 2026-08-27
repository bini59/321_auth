// 계정 포털의 세션/연동 앱 카드에서 쓰는 순수 표시 로직.
// UA 문자열은 신뢰할 수 없는 입력이라 아는 토큰만 좁게 매칭하고, 나머지는 '알 수 없는 기기'로 접는다.

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/KAKAOTALK/i, '카카오톡 인앱'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const PLATFORMS: Array<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

function match(ua: string, table: Array<[RegExp, string]>): string | null {
  for (const [pattern, label] of table) if (pattern.test(ua)) return label;
  return null;
}

/** UA 를 "Chrome · Mac" 같은 짧은 라벨로 줄인다. 못 알아보면 '알 수 없는 기기'. */
export function describeDevice(ua: string | null | undefined): string {
  const value = String(ua ?? '').slice(0, 400);
  const browser = match(value, BROWSERS);
  const platform = match(value, PLATFORMS);
  if (browser && platform) return `${browser} · ${platform}`;
  return browser ?? platform ?? '알 수 없는 기기';
}

/** IP 는 그대로 노출하지 않고 지역 대신 쓸 수 있는 만큼만 보여준다. */
export function describeOrigin(ip: string | null | undefined): string {
  const value = String(ip ?? '').trim();
  if (!value) return '주소 미확인';
  return value;
}

/** '방금', 'n분 전' 같은 상대 시각. 7일이 넘으면 날짜로 떨어뜨린다. */
export function relativeTime(value: Date | string | number | null | undefined, now: number = Date.now()): string {
  if (value === null || value === undefined || value === '') return '기록 없음';
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) return '기록 없음';

  const diff = now - time;
  if (diff < 0) return '방금';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}일 전`;
  return new Date(time).toISOString().slice(0, 10);
}
