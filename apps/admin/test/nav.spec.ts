import { describe, expect, it } from 'vitest';
import { sectionOf } from '@/components/nav';

describe('sectionOf', () => {
  it.each([['/', 'overview'], ['/users', 'users'], ['/users/u1', 'users'], ['/apps', 'services'], ['/settings', 'settings'], ['/nope', 'overview']])(
    '%s -> %s', (pathname, section) => expect(sectionOf(pathname)).toBe(section),
  );
});
