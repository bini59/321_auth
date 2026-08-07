// apps/admin/src/theme-toggle.tsx
import { useTheme, type ThemePreference } from './use-theme';

const seg = (on: boolean): React.CSSProperties => ({
  flex: 1,
  height: 26,
  display: 'grid',
  placeItems: 'center',
  border: 0,
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
  background: on ? 'var(--seg-active)' : 'transparent',
  color: on ? 'var(--fg)' : 'var(--fg-3)',
  boxShadow: on ? 'var(--seg-shadow)' : 'none',
});

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const SystemIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { value: 'light', label: '라이트', icon: SunIcon },
  { value: 'dark', label: '다크', icon: MoonIcon },
  { value: 'system', label: '시스템', icon: SystemIcon },
];

export function ThemeToggle() {
  const { preference, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="테마"
      style={{ display: 'flex', gap: 2, padding: 3, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--panel-2)' }}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          title={label}
          onClick={() => setTheme(value)}
          style={seg(preference === value)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
