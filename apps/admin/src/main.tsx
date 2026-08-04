import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { authApi } from './api';
import './style.css';
const sections = ['overview', 'users', 'memberships', 'clients', 'operations'] as const;
type Section = typeof sections[number];
function readSection(): Section {
  const value = window.location.hash.slice(1);
  return (sections as readonly string[]).includes(value) ? value as Section : 'overview';
}

function App() {
  const [section, setSection] = useState<Section>(readSection);
  const [apiStatus, setApiStatus] = useState('확인 중');

  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener('hashchange', onHashChange);
    authApi.health().then(() => setApiStatus('정상')).catch(() => setApiStatus('확인 필요'));
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return <div className="shell"><aside><div className="brand">AUTH<span>ADMIN</span></div><nav>{sections.map((item) => <button className={item === section ? 'active' : ''} key={item} onClick={() => { window.location.hash = item; }}>{item}</button>)}</nav></aside><main><header><div><p className="eyebrow">CENTRAL AUTHORITY</p><h1>{section}</h1></div><span className="status"><i /> API {apiStatus}</span></header><section className="card"><p className="eyebrow">ADMIN CONSOLE</p><h2>{section === 'overview' ? '운영 현황을 한 곳에서 확인합니다.' : `${section} 관리 영역`}</h2><p className="muted">관리자 인증과 실제 리소스 작업은 별도 보안 경계 구현 후 활성화됩니다.</p></section></main></div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
