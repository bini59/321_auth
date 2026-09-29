import { createFileRoute } from '@tanstack/react-router';
import { ThemePicker } from '@/components/theme-picker';

export const Route = createFileRoute('/_console/settings')({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="settings">
      <div className="page-head">
        <div>
          <h1>설정</h1>
          <p>콘솔 표시 방식과 관리자 세션 정책입니다.</p>
        </div>
      </div>

      <ThemePicker />

      <div className="card">
        <div className="settings-row">
          <div className="spacer">
            <div style={{ fontSize: 13, fontWeight: 500 }}>관리자 세션</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>만료되면 비밀번호를 다시 입력해야 합니다.</div>
          </div>
          <span className="badge badge--ok">활성</span>
        </div>
      </div>
    </div>
  );
}
