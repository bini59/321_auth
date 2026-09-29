import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useServices } from '@/api/queries';
import { PlusIcon } from '@/components/icons';
import { ServiceForm } from '@/components/service-form';

export const Route = createFileRoute('/_console/apps/')({ component: ServicesPage });

function ServicesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const { data: services = [] } = useServices();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>서비스</h1>
          <p>auth에 등록된 앱 클라이언트입니다. 카드를 눌러 설정과 가입 회원을 확인하세요.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setFormOpen((v) => !v)}>
          <PlusIcon />서비스 등록
        </button>
      </div>

      {formOpen && <ServiceForm onClose={() => setFormOpen(false)} />}

      <div className="service-grid">
        {services.map((service) => (
          <Link key={service.client_id} to="/apps/$clientId" params={{ clientId: service.client_id }} className={service.is_active ? 'card service-card' : 'card service-card inactive'}>
            <div className="cell-main">
              <div className="service-mark service-mark--lg" style={{ background: service.theme_color || 'var(--fg-3)' }}>
                {(service.serviceName || service.name).slice(0, 1)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontWeight: 500 }}>{service.serviceName || service.name}</div>
                <div className="dim mono truncate" style={{ fontSize: 11.5 }}>{service.client_id}</div>
              </div>
            </div>
            <div className="muted mono truncate" style={{ fontSize: 12 }}>{service.allowed_origins.join(', ')}</div>
            <div className="cell-main">
              <span className={service.is_active ? 'badge badge--ok' : 'badge'}>{service.is_active ? '활성' : '비활성'}</span>
              {service.auto_provision && <span className="badge">자동가입</span>}
              {service.membership_count !== undefined && <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>회원 {service.membership_count}명</span>}
            </div>
          </Link>
        ))}
      </div>

      {services.length === 0 && (
        <div className="card empty">
          <strong>등록된 서비스가 없습니다</strong>
          <p>첫 번째 앱 클라이언트를 등록해 로그인 연동을 시작하세요.</p>
          <button className="btn btn--primary" onClick={() => setFormOpen(true)}>서비스 등록</button>
        </div>
      )}
    </>
  );
}
