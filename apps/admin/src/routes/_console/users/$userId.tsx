import { createFileRoute, Link } from '@tanstack/react-router';
import type { AdminMembership, AdminUserDetail } from '@/api';
import { useRevokeSessions, useServices, useUpdateMembership, useUser } from '@/api/queries';
import { Avatar } from '@/components/avatar';
import { useToast } from '@/components/toast';

export const Route = createFileRoute('/_console/users/$userId')({ component: UserDetailPage });

function UserDetailPage() {
  const { userId } = Route.useParams();
  const { data, isLoading } = useUser(userId);
  // useUser 는 이전 사용자를 placeholder 로 들고 있으므로 요청한 사용자일 때만 그린다.
  const user = data?.userId === userId ? data : null;

  return (
    <>
      <Link to="/users" className="back-link">← 사용자 목록</Link>
      {user ? <UserDetail key={user.userId} user={user} /> : <p className="dim">{isLoading ? '불러오는 중입니다.' : '사용자를 찾을 수 없습니다.'}</p>}
    </>
  );
}

function UserDetail({ user }: { user: AdminUserDetail }) {
  const { toast, confirm } = useToast();
  const updateMembership = useUpdateMembership();
  const revokeSessions = useRevokeSessions();
  const { data: services = [] } = useServices();
  const colorOf = (clientId: string) => services.find((s) => s.client_id === clientId)?.theme_color || 'var(--fg-3)';

  const onMembership = async (membership: AdminMembership, update: { role?: string; status?: string }) => {
    if (!(await confirm(`${membership.clientName} 회원 자격을 변경할까요?`, { confirmLabel: '변경' }))) return;
    try {
      await updateMembership.mutateAsync({ userId: user.userId, clientId: membership.clientId, update });
      toast('회원 자격을 변경했습니다.');
    } catch {
      toast('멤버십 변경에 실패했습니다.', 'danger');
    }
  };

  const onRevoke = async () => {
    if (!(await confirm(`${user.name || user.userId}의 모든 세션을 폐기할까요?`, { confirmLabel: '폐기', tone: 'danger' }))) return;
    try {
      await revokeSessions.mutateAsync(user.userId);
      toast('모든 세션을 폐기했습니다.', 'danger');
    } catch {
      toast('세션 폐기에 실패했습니다.', 'danger');
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="cell-main">
          <Avatar name={user.name} url={user.avatarUrl} style={{ width: 40, height: 40, fontSize: 14 }} />
          <div>
            <h1>{user.name || '(이름 없음)'}</h1>
            <p>{user.email || '이메일 없음'}</p>
            <p className="dim mono" style={{ fontSize: 11 }}>{user.userId}</p>
          </div>
        </div>
        <div className="actions">
          <button className="btn btn--danger" onClick={() => void onRevoke()}>모든 세션 폐기</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">로그인 수단</div>
        <div className="card-body chips">
          {user.identities.map((identity) => (
            <div className="chip" key={`${identity.provider}-${identity.providerUserId}`}>
              {identity.provider}
              <span className="dim mono" style={{ fontSize: 11 }}>{identity.providerUserId.slice(0, 10)}</span>
            </div>
          ))}
          {user.identities.length === 0 && <span className="dim" style={{ fontSize: 12.5 }}>연결된 Provider 없음</span>}
        </div>
      </div>

      <div className="section-label">가입한 서비스 {user.memberships.length}개</div>
      <div className="service-grid">
        {user.memberships.map((m) => (
          <div key={m.clientId} className={m.status === 'active' ? 'card membership-card' : 'card membership-card suspended'}>
            <Link to="/apps/$clientId" params={{ clientId: m.clientId }} className="membership-card-head" aria-label={`${m.clientName} 서비스 상세`}>
              <div className="service-mark service-mark--lg" style={{ background: colorOf(m.clientId) }}>{m.clientName.slice(0, 1)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="truncate" style={{ fontWeight: 500 }}>{m.clientName}</div>
                <div className="dim mono truncate" style={{ fontSize: 11.5 }}>{m.clientId}</div>
              </div>
              <span className="go-indicator" aria-hidden>→</span>
            </Link>
            <div className="membership-fields">
              <select className="select" aria-label={`${m.clientName} 상태`} value={m.status} onChange={(e) => void onMembership(m, { status: e.target.value })}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
              <select className="select" aria-label={`${m.clientName} 역할`} value={m.role} onChange={(e) => void onMembership(m, { role: e.target.value })}>
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </div>
            <div className="dim mono" style={{ fontSize: 11.5 }}>
              가입 {m.joinedAt.slice(0, 10)} · 최근 접속 {m.lastSeenAt?.slice(0, 10) ?? '-'}
            </div>
          </div>
        ))}
      </div>
      {user.memberships.length === 0 && <div className="card empty"><p>가입한 서비스가 없습니다.</p></div>}
    </>
  );
}
