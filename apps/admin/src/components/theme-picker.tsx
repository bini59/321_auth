import { useTheme, type ThemePreference } from '@/hooks/use-theme';

const PREVIEW: Record<ThemePreference, React.JSX.Element> = {
  light: (
    <div className="theme-preview" style={{ border: '1px solid #e6e6e6', background: '#fff' }}>
      <div style={{ width: 26, background: '#fafafa', borderRight: '1px solid #e6e6e6' }} />
      <div style={{ flex: 1, padding: 7, display: 'grid', gap: 4, alignContent: 'start' }}>
        <div style={{ height: 5, width: '60%', background: '#e6e6e6', borderRadius: 3 }} />
        <div style={{ height: 5, width: '40%', background: '#efefef', borderRadius: 3 }} />
      </div>
    </div>
  ),
  dark: (
    <div className="theme-preview" style={{ border: '1px solid #242424', background: '#0a0a0a' }}>
      <div style={{ width: 26, background: '#0f0f0f', borderRight: '1px solid #242424' }} />
      <div style={{ flex: 1, padding: 7, display: 'grid', gap: 4, alignContent: 'start' }}>
        <div style={{ height: 5, width: '60%', background: '#2b2b2b', borderRadius: 3 }} />
        <div style={{ height: 5, width: '40%', background: '#1e1e1e', borderRadius: 3 }} />
      </div>
    </div>
  ),
  system: (
    <div className="theme-preview" style={{ border: '1px solid var(--border)' }}>
      <div style={{ flex: 1, background: '#fff', borderRight: '1px solid #e6e6e6' }} />
      <div style={{ flex: 1, background: '#0a0a0a' }} />
    </div>
  ),
};

const LABEL: Record<ThemePreference, string> = { light: '라이트', dark: '다크', system: '시스템' };

export function ThemePicker() {
  const { preference, resolved, setTheme } = useTheme();

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-body">
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>테마</div>
        <p className="muted" style={{ margin: '5px 0 14px', fontSize: 12.5 }}>
          시스템을 선택하면 OS 설정에 따라 자동으로 전환됩니다.
        </p>
        <div className="theme-cards" role="radiogroup" aria-label="테마">
          {(['light', 'dark', 'system'] as ThemePreference[]).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={preference === value}
              className={preference === value ? 'theme-card active' : 'theme-card'}
              onClick={() => setTheme(value)}
            >
              {PREVIEW[value]}
              <span>{LABEL[value]}</span>
            </button>
          ))}
        </div>
        <div className="dim" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12 }}>
          현재 적용: {preference === 'system' ? `시스템 · ${LABEL[resolved]}` : LABEL[preference]}
        </div>
      </div>
    </div>
  );
}
