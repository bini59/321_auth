import type { ReactNode } from 'react';
import { LogoutIcon, SearchIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { BRAND, NAV, TITLE, type Section } from './nav';

export function AppShell({ section, apiUp, onNavigate, onOpenPalette, onLogout, children }: {
  section: Section;
  apiUp: boolean | null;
  onNavigate: (next: Section) => void;
  onOpenPalette: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
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
          <button className="nav-item" onClick={onLogout}>
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
          <div className="status-pill">
            <span className={apiUp === false ? 'dot dot--down' : 'dot dot--ok'} />
            API {apiUp === null ? '확인 중' : apiUp ? '정상' : '확인 필요'}
          </div>
          <div className="avatar">KV</div>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
