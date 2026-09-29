import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useLogout, useUsers } from '@/api/queries';
import { CommandPalette, type Command } from '@/components/command-palette';
import type { ThemePreference } from '@/hooks/use-theme';
import { NAV } from './nav';

// 팔레트는 명령을 실행하자마자 언마운트되므로 테마 상태(useTheme)는 콘솔 레이아웃이 들고 있다가 넘겨준다.
export function ConsolePalette({ setTheme, onClose }: { setTheme: (next: ThemePreference) => void; onClose: () => void }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const users = useUsers(''); // 팔레트가 열려 있는 동안에만 사용자 목록을 조회한다.

  const commands = useMemo<Command[]>(() => [
    ...NAV.map((item) => ({ id: `go-${item.id}`, label: `${item.label}(으)로 이동`, group: '이동', badge: '↵', run: () => navigate({ to: item.to }) })),
    { id: 'theme-light', label: '테마: 라이트', group: '테마', badge: '☀', run: () => setTheme('light') },
    { id: 'theme-dark', label: '테마: 다크', group: '테마', badge: '☾', run: () => setTheme('dark') },
    { id: 'theme-system', label: '테마: 시스템', group: '테마', badge: '⌘', run: () => setTheme('system') },
    { id: 'logout', label: '로그아웃', group: '작업', badge: '⇥', run: () => logout.mutate() },
    ...(users.data ?? []).map((user) => ({
      id: `user-${user.userId}`,
      label: `${user.name || user.userId} 열기`,
      group: '사용자',
      badge: (user.name || '?').slice(0, 2),
      run: () => navigate({ to: '/users', search: { id: user.userId } }),
    })),
  ], [users.data]);

  return <CommandPalette commands={commands} onClose={onClose} />;
}
