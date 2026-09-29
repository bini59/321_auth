import type { ReactNode } from 'react';
import { useHealth, useLogout } from '@/api/queries';
import { LogoutIcon, SearchIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
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

export function AppShell({ section, onNavigate, onOpenPalette, children }: {
  section: Section;
  onNavigate: (next: Section) => void;
  onOpenPalette: () => void;
  children: ReactNode;
}) {
  const logout = useLogout();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div style={{ display: 'grid', gap: 1 }}>
            <span className="brand-name">{BRAND.name}</span>
            <span className="brand-host mono">{BRAND.host}</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={id === section ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate(id)}>
              <Icon />{label}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <div className="sidebar-foot">
          <ThemeToggle />
          <button className="nav-item" onClick={() => logout.mutate()}>
            <LogoutIcon />로그아웃
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="crumb">
            <span className="mono">auth</span><span>/</span><strong>{TITLE[section]}</strong>
          </div>
          <span className="spacer" />
          <button className="cmdk-btn" onClick={onOpenPalette}>
            <SearchIcon size={13} />검색 및 명령<span className="spacer" /><kbd>⌘K</kbd>
          </button>
          <ApiStatus />
          <div className="avatar">KV</div>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
