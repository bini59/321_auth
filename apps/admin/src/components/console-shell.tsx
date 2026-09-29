import type { ReactNode } from 'react';
import { AppShell, ThemeToggle } from '@bini59/design';
import { Link } from '@tanstack/react-router';
import { useHealth, useLogout, useSession } from '@/api/queries';
import { SearchIcon } from '@/components/icons';
import { BRAND, NAV, TITLE, type Section } from './nav';

function ApiStatus() {
  const health = useHealth();
  const apiUp = health.isPending ? null : health.isSuccess;
  return (
    <div className="status-pill">
      <span className={apiUp === false ? 'dot dot--down' : 'dot dot--ok'} />
      API {apiUp === null ? '확인 중' : apiUp ? '정상' : '확인 필요'}
    </div>
  );
}

/** 디자인 시스템 AppShell 로 콘솔 레이아웃을 채운다. 프로필은 사이드바 왼쪽 아래(로그아웃은 프로필 메뉴 안). */
export function ConsoleShell({ section, onOpenPalette, children }: { section: Section; onOpenPalette: () => void; children: ReactNode }) {
  const logout = useLogout();
  const user = useSession(true).data?.user ?? null;
  return (
    <AppShell
      brand={{ mark: 'A', name: BRAND.name, host: BRAND.host }}
      nav={NAV}
      renderLink={(item, inner) => <Link to={NAV.find((entry) => entry.id === item.id)!.to}>{inner}</Link>}
      activeId={section}
      user={user}
      onLogout={() => logout.mutate()}
      profilePlacement="sidebar"
      sidebarFoot={<ThemeToggle />}
      crumb={<><span className="mono">auth</span><span>/</span><strong>{TITLE[section]}</strong></>}
      topbarActions={(
        <>
          <button className="cmdk-btn" onClick={onOpenPalette} aria-label="검색 및 명령">
            <SearchIcon size={13} /><span className="cmdk-label">검색 및 명령</span><span className="spacer" /><kbd>⌘K</kbd>
          </button>
          <ApiStatus />
        </>
      )}
    >
      {children}
    </AppShell>
  );
}
