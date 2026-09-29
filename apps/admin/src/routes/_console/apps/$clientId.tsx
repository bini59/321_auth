import { useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { AdminService } from '@/api';
import { useRotateServiceSecret, useServiceMemberships, useServices, useSetServiceActive, useUpdateService } from '@/api/queries';
import { Avatar } from '@/components/avatar';
import { Skeleton, ServiceDetailSkeleton, TableRows } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { serviceMembershipMessage } from '@/utils/service-memberships';

export const Route = createFileRoute('/_console/apps/$clientId')({ component: ServiceDetailPage });

function ServiceDetailPage() {
  const { clientId } = Route.useParams();
  const { data: services, isLoading } = useServices();
  const service = services?.find((s) => s.client_id === clientId);
  if (isLoading) return <ServiceDetailSkeleton />;

  return (
    <>
      <Link to="/apps" className="back-link">← 서비스 목록</Link>
      {service ? <ServiceDetail key={service.client_id} service={service} /> : <p className="dim">서비스를 찾을 수 없습니다.</p>}
      <ServiceMembers clientId={clientId} />
    </>
  );
}

function ServiceDetail({ service }: { service: AdminService }) {
  const { toast, confirm } = useToast();
  const updateService = useUpdateService();
  const setServiceActive = useSetServiceActive();
  const rotateSecret = useRotateServiceSecret();
  const [form, setForm] = useState({
    name: service.name,
    allowed_origins: service.allowed_origins.join(', '),
    default_redirect: service.default_redirect,
    onboarding_path: service.onboarding_path ?? '',
    auto_provision: service.auto_provision,
  });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await updateService.mutateAsync({
        id: service.client_id,
        body: {
          name: form.name,
          allowed_origins: form.allowed_origins.split(',').map((v) => v.trim()).filter(Boolean),
          default_redirect: form.default_redirect,
          auto_provision: form.auto_provision,
          onboarding_path: form.onboarding_path || null,
        },
      });
      toast('저장했습니다.');
    } catch {
      toast('저장에 실패했습니다. 입력값을 확인하세요.', 'danger');
    }
  };

  const toggleActive = async () => {
    const next = !service.is_active;
    if (!(await confirm(`${service.name}을(를) ${next ? '활성화' : '비활성화'}할까요?`, { confirmLabel: next ? '활성화' : '비활성화', tone: next ? 'ok' : 'danger' }))) return;
    try {
      await setServiceActive.mutateAsync({ id: service.client_id, active: next });
      toast(`${service.name}을(를) ${next ? '활성화' : '비활성화'}했습니다.`, next ? 'ok' : 'warn');
    } catch {
      toast('상태 변경에 실패했습니다.', 'danger');
    }
  };

  const rotate = async () => {
    if (!(await confirm(`${service.client_id}의 secret을 재발급할까요? 기존 secret은 즉시 무효화됩니다.`, { confirmLabel: '재발급', tone: 'danger' }))) return;
    try {
      const result = await rotateSecret.mutateAsync(service.client_id);
      await navigator.clipboard?.writeText(result.secret).catch(() => undefined);
      toast('새 secret을 클립보드에 복사했습니다.');
    } catch {
      toast('secret 재발급에 실패했습니다.', 'danger');
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="cell-main">
          <div className="service-mark service-mark--lg" style={{ background: service.theme_color || 'var(--fg-3)' }}>{service.name.slice(0, 1)}</div>
          <div>
            <div className="title-row">
              <h1>{service.name}</h1>
              <span className={service.is_active ? 'badge badge--ok' : 'badge'}>{service.is_active ? '활성' : '비활성'}</span>
            </div>
            <p className="mono dim" style={{ fontSize: 12 }}>{service.client_id}</p>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => void rotate()}>secret 재발급</button>
          <button className={service.is_active ? 'btn btn--danger' : 'btn'} onClick={() => void toggleActive()}>{service.is_active ? '비활성화' : '활성화'}</button>
        </div>
      </div>

      <form className="card" style={{ marginBottom: 12 }} onSubmit={(e) => void save(e)}>
        <div className="card-head">설정</div>
        <div className="card-body">
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="svc-name">서비스 이름</label>
              <input id="svc-name" className="input" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="svc-origins">허용 origin (쉼표로 구분)</label>
              <input id="svc-origins" className="input mono" required value={form.allowed_origins} onChange={(e) => set({ allowed_origins: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="svc-redirect">기본 반환 주소</label>
              <input id="svc-redirect" className="input mono" required value={form.default_redirect} onChange={(e) => set({ default_redirect: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="svc-onboarding">온보딩 path</label>
              <input id="svc-onboarding" className="input mono" placeholder="/onboarding" value={form.onboarding_path} onChange={(e) => set({ onboarding_path: e.target.value })} />
            </div>
          </div>
          <div className="form-foot">
            <label className="checkbox">
              <input type="checkbox" checked={form.auto_provision} onChange={(e) => set({ auto_provision: e.target.checked })} />
              신규 사용자 자동 프로비저닝 허용
            </label>
            <span className="spacer" />
            <button type="submit" className="btn btn--accent" disabled={updateService.isPending}>저장</button>
          </div>
        </div>
      </form>
    </>
  );
}

function ServiceMembers({ clientId }: { clientId: string }) {
  const { data, status, hasNextPage, fetchNextPage, isFetchingNextPage } = useServiceMemberships(clientId);
  const members = data?.pages.flat() ?? [];
  const message = status === 'pending' ? null : serviceMembershipMessage(status === 'error' ? 'error' : 'ready', members.length);

  return (
    <div className="card">
      <div className="card-head">가입한 사용자 {status === 'pending' ? <Skeleton w={28} h={11} style={{ display: 'inline-block' }} /> : <span className="dim">{members.length}{hasNextPage ? '+' : ''}명</span>}</div>
      {status === 'pending' && <TableRows rows={4} cols={3} />}
      {members.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>사용자</th><th>역할</th><th>상태</th><th>가입일</th><th>최근 접속</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <Link to="/users" search={{ id: m.userId }} className="cell-main" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Avatar className="avatar avatar--sm" name={m.name} url={null} />
                      <div style={{ minWidth: 0 }}>
                        <div className="truncate" style={{ fontWeight: 500 }}>{m.name || '(이름 없음)'}</div>
                        <div className="dim truncate" style={{ fontSize: 11.5 }}>{m.email || '이메일 없음'}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="muted">{m.role}</td>
                  <td><span className={m.status === 'active' ? 'badge badge--ok' : 'badge badge--danger'}>{m.status}</span></td>
                  <td className="dim mono" style={{ fontSize: 12.5 }}>{m.joinedAt.slice(0, 10)}</td>
                  <td className="dim mono" style={{ fontSize: 12.5 }}>{m.lastSeenAt?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message && <div className="empty"><p>{message}</p></div>}
      {hasNextPage && (
        <div className="card-body" style={{ textAlign: 'center' }}>
          <button className="btn" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>더 보기</button>
        </div>
      )}
    </div>
  );
}
