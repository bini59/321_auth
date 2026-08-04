import { describe, expect, it } from 'vitest';
import { validateReturnTo } from './return-to';

const client = {
  allowedOrigins: ['https://a.bini59.dev'],
  defaultRedirect: 'https://a.bini59.dev/dash',
};

describe('validateReturnTo (PRD §7.1)', () => {
  it('허용 origin이면 그대로 사용', () => {
    expect(validateReturnTo('https://a.bini59.dev/settings', client)).toBe(
      'https://a.bini59.dev/settings',
    );
  });

  it('startsWith 우회 (evil subdomain) 차단', () => {
    expect(validateReturnTo('https://a.bini59.dev.evil.com/x', client)).toBe(
      client.defaultRedirect,
    );
  });

  it('다른 origin 차단', () => {
    expect(validateReturnTo('https://evil.com/x', client)).toBe(client.defaultRedirect);
  });

  it('없거나 파싱 불가면 기본값', () => {
    expect(validateReturnTo(undefined, client)).toBe(client.defaultRedirect);
    expect(validateReturnTo('not a url', client)).toBe(client.defaultRedirect);
    expect(validateReturnTo('', client)).toBe(client.defaultRedirect);
  });

  it('path/query는 유지', () => {
    expect(validateReturnTo('https://a.bini59.dev/x?a=1#b', client)).toBe(
      'https://a.bini59.dev/x?a=1#b',
    );
  });
});
