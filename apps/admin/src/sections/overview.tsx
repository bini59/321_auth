// apps/admin/src/sections/overview.tsx
import type { AdminOverview } from '../api';
import { formatAdminCount, serviceStatusLabel } from '../view-model';

export function OverviewSection({ data }: { data: AdminOverview | null }) {
  const metrics = [
    { label: '사용자', value: formatAdminCount(data?.userCount), hint: '전체 등록 인물' },
    { label: '서비스', value: formatAdminCount(data?.clientCount), hint: 'auth에 등록된 앱 클라이언트' },
    { label: '활성 멤버십', value: formatAdminCount(data?.activeMembershipCount), hint: '전체 서비스 합계' },
    { label: '정지 멤버십', value: formatAdminCount(data?.suspendedMembershipCount), hint: '검토 필요', danger: true },
  ];
  const deps = [
    { name: 'postgres', status: data?.services.postgres },
    { name: 'redis', status: data?.services.redis },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>개요</h1>
          <p>중앙 인증 서버의 현재 운영 상태입니다.</p>
        </div>
      </div>

      <div className="metrics">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <div className="metric-top">
              <span className="metric-label">{metric.label}</span>
              {metric.danger && data?.suspendedMembershipCount ? <span className="badge badge--danger">검토</span> : null}
            </div>
            <div className="metric-value">{metric.value}</div>
            <div className="metric-hint">{metric.hint}</div>
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">의존 서비스</div>
          <div className="card-body row-list" style={{ paddingTop: 4, paddingBottom: 10 }}>
            {deps.map((dep) => (
              <div key={dep.name}>
                <span className={dep.status === 'up' ? 'dot dot--ok' : 'dot dot--down'} />
                <span className="mono" style={{ fontSize: 13 }}>{dep.name}</span>
                <span className="spacer" />
                <span className="muted" style={{ fontSize: 12 }}>
                  {dep.status ? serviceStatusLabel(dep.status) : '확인 필요'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
