import { describe, expect, it } from 'vitest';
import { formatAdminCount, serviceStatusLabel } from './view-model';

describe('Admin dashboard view model', () => {
  it('formats real and unavailable counts without exposing raw null values', () => {
    expect(formatAdminCount(1234)).toBe('1,234');
    expect(formatAdminCount(null)).toBe('확인 필요');
  });

  it('maps dependency health to user-facing status labels', () => {
    expect(serviceStatusLabel('up')).toBe('정상');
    expect(serviceStatusLabel('down')).toBe('확인 필요');
  });
});
