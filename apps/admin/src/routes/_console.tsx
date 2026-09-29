import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { sessionQuery } from '@/api/queries';
import { useCommandPalette } from '@/components/command-palette';
import { useTheme } from '@/hooks/use-theme';
import { ConsolePalette } from '@/components/console-palette';
import { ConsoleShell } from '@/components/console-shell';
import { sectionOf } from '@/components/nav';

// 로그인 뒤 화면 전부의 레이아웃. 세션 확인은 페이지당 한 번(staleTime: Infinity), 만료는 각 API 호출의 401 처리가 맡는다.
export const Route = createFileRoute('/_console')({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQuery);
    } catch {
      throw redirect({ to: '/login', search: { return_to: window.location.pathname + window.location.search + window.location.hash } });
    }
  },
  component: Console,
});

function Console() {
  const { setTheme } = useTheme();
  const palette = useCommandPalette();
  const { pathname } = useLocation();
  return (
    <>
      <ConsoleShell section={sectionOf(pathname)} onOpenPalette={() => palette.setOpen(true)}>
        <Outlet />
      </ConsoleShell>
      {palette.open && <ConsolePalette setTheme={setTheme} onClose={() => palette.setOpen(false)} />}
    </>
  );
}
