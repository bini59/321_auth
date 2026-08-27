import { describe, expect, it } from 'vitest';
import { describeDevice, describeOrigin, relativeTime } from './session-view';

describe('describeDevice', () => {
  it('names the browser and platform for common user agents', () => {
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36')).toBe('Chrome · Mac');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1')).toBe('Safari · iPhone');
  });

  it('prefers the specific browser over the Chrome/Safari tokens it also carries', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124.0 Safari/537.36 Edg/124.0')).toBe('Edge · Windows');
  });

  it('falls back rather than echoing an unrecognised agent string', () => {
    expect(describeDevice('<script>alert(1)</script>')).toBe('알 수 없는 기기');
    expect(describeDevice('')).toBe('알 수 없는 기기');
    expect(describeDevice(null)).toBe('알 수 없는 기기');
  });
});

describe('describeOrigin', () => {
  it('shows the address when present and a placeholder when not', () => {
    expect(describeOrigin('203.0.113.7')).toBe('203.0.113.7');
    expect(describeOrigin('   ')).toBe('주소 미확인');
    expect(describeOrigin(null)).toBe('주소 미확인');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z');

  it('describes recent activity in minutes, hours, and days', () => {
    expect(relativeTime(now - 30_000, now)).toBe('방금');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5분 전');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2일 전');
  });

  it('drops to a date once the gap passes a week', () => {
    expect(relativeTime(now - 30 * 86_400_000, now)).toBe('2026-07-28');
  });

  it('handles dates, iso strings, and missing values', () => {
    expect(relativeTime(new Date(now - 60_000), now)).toBe('1분 전');
    expect(relativeTime('2026-08-27T11:00:00.000Z', now)).toBe('1시간 전');
    expect(relativeTime(null, now)).toBe('기록 없음');
    expect(relativeTime('not a date', now)).toBe('기록 없음');
  });
});
