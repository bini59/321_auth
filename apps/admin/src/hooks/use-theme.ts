// apps/admin/src/hooks/use-theme.ts
import { useCallback, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '@bini59/design';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// 디자인 시스템 ThemeToggle 과 같은 키를 써야 사이드바 토글과 설정 화면이 서로 맞는다.
const STORAGE_KEY = THEME_STORAGE_KEY;

function readPreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => { apply(resolved); }, [resolved]);

  const setTheme = useCallback((next: ThemePreference) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
  }, []);

  return { preference, resolved, setTheme };
}
