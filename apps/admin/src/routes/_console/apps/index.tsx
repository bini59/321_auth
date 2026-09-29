import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { AdminService } from '@/api';
import { useRotateServiceSecret, useServices, useSetServiceActive, useUpdateService } from '@/api/queries';
import { PlusIcon } from '@/components/icons';
import { ServiceForm } from '@/components/service-form';
import { useToast } from '@/components/toast';

export const Route = createFileRoute('/_console/apps/')({ component: ServicesPage });

function ServicesPage() {
  const { toast, confirm } = useToast();
  const [formOpen, setFormOpen] = useState(false);

  const { data: services = [] } = useServices();
  const updateService = useUpdateService();
  const setServiceActive = useSetServiceActive();
  const rotateServiceSecret = useRotateServiceSecret();

  const patch = async (service: AdminService, update: Partial<AdminService>) => {
    try {
      await updateService.mutateAsync({
        id: service.client_id,
        body: {
          name: update.name ?? service.name,
          allowed_origins: update.allowed_origins ?? service.allowed_origins,
          default_redirect: update.default_redirect ?? service.default_redirect,
          auto_provision: update.auto_provision ?? service.auto_provision,
          onboarding_path: update.onboarding_path ?? service.onboarding_path,
        },
      });
    } catch {
      toast('변경에 실패했습니다.', 'danger');
    }
  };

  const toggleActive = async (service: AdminService) => {
    const ok = await confirm(
      `${service.name}을(를) ${service.is_active ? '비활성화' : '활성화'}할까요?`,
      { confirmLabel: service.is_active ? '비활성화' : '활성화', tone: service.is_active ? 'danger' : 'ok' },
    );
    if (!ok) return;
    await setServiceActive.mutateAsync({ id: service.client_id, active: !service.is_active });
    toast(`${service.name}을(를) ${service.is_active ? '비활성화' : '활성화'}했습니다.`, service.is_active ? 'warn' : 'ok');
  };

  const rotate = async (service: AdminService) => {
    const ok = await confirm(`${service.client_id}의 secret을 재발급할까요? 기존 secret은 즉시 무효화됩니다.`, { confirmLabel: '재발급', tone: 'danger' });
    if (!ok) return;
    const result = await rotateServiceSecret.mutateAsync(service.client_id);
    await navigator.clipboard?.writeText(result.secret).catch(() => undefined);
    toast(`${service.client_id} 새 secret을 클립보드에 복사했습니다.`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>서비스</h1>
          <p>auth에 등록된 앱 클라이언트와 반환 주소 정책입니다.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setFormOpen((v) => !v)}>
          <PlusIcon />서비스 등록
        </button>
      </div>

      {formOpen && <ServiceForm onClose={() => setFormOpen(false)} />}

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>서비스</th>
                <th>허용 origin</th>
                <th>자동가입</th>
                <th>상태</th>
                <th className="right">작업</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.client_id} className={service.is_active ? undefined : 'inactive'}>
                  <td>
                    <div className="cell-main">
                      <div className="service-mark" style={{ background: service.theme_color || 'var(--fg-3)' }}>
                        {(service.serviceName || service.name).slice(0, 1)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{service.serviceName || service.name}</div>
                        <div className="dim mono" style={{ fontSize: 11.5 }}>{service.serviceId || service.client_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="muted mono" style={{ fontSize: 12 }}>{service.allowed_origins.join(', ')}</td>
                  <td>
                    <button
                      className={service.auto_provision ? 'switch on' : 'switch'}
                      aria-label={`${service.name} 자동가입`}
                      aria-pressed={service.auto_provision}
                      onClick={() => void patch(service, { auto_provision: !service.auto_provision })}
                    >
                      <span />
                    </button>
                  </td>
                  <td><span className={service.is_active ? 'badge badge--ok' : 'badge'}>{service.is_active ? '활성' : '비활성'}</span></td>
                  <td>
                    <div className="actions">
                      <button className="btn btn--sm" onClick={() => void rotate(service)}>secret 재발급</button>
                      <button className="btn btn--sm" onClick={() => void toggleActive(service)}>{service.is_active ? '비활성화' : '활성화'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {services.length === 0 && (
          <div className="empty">
            <strong>등록된 서비스가 없습니다</strong>
            <p>첫 번째 앱 클라이언트를 등록해 로그인 연동을 시작하세요.</p>
            <button className="btn btn--primary" onClick={() => setFormOpen(true)}>서비스 등록</button>
          </div>
        )}
      </div>
    </>
  );
}
