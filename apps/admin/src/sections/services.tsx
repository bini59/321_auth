// apps/admin/src/sections/services.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { authApi, type AdminService } from '../api';
import { PlusIcon } from '../icons';
import { useToast } from '../toast';

const EMPTY_FORM = { client_id: '', name: '', allowed_origins: '', default_redirect: '', auto_provision: false, onboarding_path: '' };

export function ServicesSection({ csrfToken }: { csrfToken: string }) {
  const { toast, confirm } = useToast();
  const [services, setServices] = useState<AdminService[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = () => authApi.services().then(setServices).catch(() => toast('Service 목록을 불러오지 못했습니다.', 'danger'));
  useEffect(() => { void load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await authApi.createService(
        {
          service_id: form.client_id,
          name: form.name,
          allowed_origins: form.allowed_origins.split(',').map((value) => value.trim()),
          default_redirect: form.default_redirect,
          auto_provision: form.auto_provision,
          onboarding_path: form.onboarding_path || null,
        },
        csrfToken,
      );
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await load();
      toast(`생성됨. 새 secret: ${result.secret}`);
    } catch {
      toast('생성에 실패했습니다. 입력값을 확인하세요.', 'danger');
    }
  };

  const patch = async (service: AdminService, update: Partial<AdminService>) => {
    try {
      await authApi.updateService(
        service.client_id,
        {
          name: update.name ?? service.name,
          allowed_origins: update.allowed_origins ?? service.allowed_origins,
          default_redirect: update.default_redirect ?? service.default_redirect,
          auto_provision: update.auto_provision ?? service.auto_provision,
          onboarding_path: update.onboarding_path ?? service.onboarding_path,
        },
        csrfToken,
      );
      await load();
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
    await authApi.setServiceActive(service.client_id, !service.is_active, csrfToken);
    await load();
    toast(`${service.name}을(를) ${service.is_active ? '비활성화' : '활성화'}했습니다.`, service.is_active ? 'warn' : 'ok');
  };

  const rotate = async (service: AdminService) => {
    const ok = await confirm(`${service.client_id}의 secret을 재발급할까요? 기존 secret은 즉시 무효화됩니다.`, { confirmLabel: '재발급', tone: 'danger' });
    if (!ok) return;
    const result = await authApi.rotateServiceSecret(service.client_id, csrfToken);
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

      {formOpen && (
        <form className="card" style={{ marginBottom: 12 }} onSubmit={(event) => void create(event)}>
          <div className="card-head">새 서비스</div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="svc-id">서비스 ID</label>
                <input id="svc-id" className="input mono" required placeholder="notes" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="svc-name">서비스 이름</label>
                <input id="svc-name" className="input" required placeholder="Notes" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="svc-origins">허용 origin (쉼표로 구분)</label>
                <input id="svc-origins" className="input mono" required placeholder="https://notes.bini59.dev" value={form.allowed_origins} onChange={(e) => setForm({ ...form, allowed_origins: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="svc-redirect">기본 반환 주소</label>
                <input id="svc-redirect" className="input mono" required placeholder="/app" value={form.default_redirect} onChange={(e) => setForm({ ...form, default_redirect: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="svc-onboarding">온보딩 path</label>
                <input id="svc-onboarding" className="input mono" placeholder="/onboarding" value={form.onboarding_path} onChange={(e) => setForm({ ...form, onboarding_path: e.target.value })} />
              </div>
            </div>
            <div className="form-foot">
              <label className="checkbox">
                <input type="checkbox" checked={form.auto_provision} onChange={(e) => setForm({ ...form, auto_provision: e.target.checked })} />
                신규 사용자 자동 프로비저닝 허용
              </label>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="btn btn--accent" disabled={!csrfToken}>등록</button>
            </div>
          </div>
        </form>
      )}

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
