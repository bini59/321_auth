import type { AdminMembership, AdminUserDetail } from '@/api';
import { useRevokeSessions, useUpdateMembership } from '@/api/queries';
import { Avatar } from '@/components/avatar';
import { CloseIcon } from '@/components/icons';
import { useToast } from '@/components/toast';

export function UserDetail({ selected, onClose }: { selected: AdminUserDetail; onClose: () => void }) {
  const { toast, confirm } = useToast();
  const updateMembership = useUpdateMembership();
  const revokeSessions = useRevokeSessions();

const onMembership = async (membership: AdminMembership, update: { role?: string; status?: string }) => {
    const ok = await confirm(`${membership.clientName} 회원 자격을 변경할까요?`, { confirmLabel: '변경' });
    if (!ok) return;
    try {
      await updateMembership.mutateAsync({ userId: selected.userId, clientId: membership.clientId, update });
      toast('회원 자격을 변경했습니다.');
    } catch {
      toast('멤버십 변경에 실패했습니다.', 'danger');
    }
  };

  const onRevoke = async () => {
    const ok = await confirm(`${selected.name || selected.userId}의 모든 세션을 폐기할까요?`, { confirmLabel: '폐기', tone: 'danger' });
    if (!ok) return;
    try {
      await revokeSessions.mutateAsync(selected.userId);
      toast('모든 세션을 폐기했습니다.', 'danger');
    } catch {
      toast('세션 폐기에 실패했습니다.', 'danger');
    }
  };

    return (
    <div className="card user-detail">
      <div className="detail-head">
        <Avatar name={selected.name} url={selected.avatarUrl} style={{ width: 34, height: 34, fontSize: 12 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="detail-name">{selected.name || '(이름 없음)'}</div>
          <div className="muted" style={{ fontSize: 12 }}>{selected.email || '이메일 없음'}</div>
          <div className="dim mono" style={{ fontSize: 11, marginTop: 3 }}>{selected.userId}</div>
        </div>
        <button className="icon-btn" onClick={() => onClose()} aria-label="닫기"><CloseIcon /></button>
      </div>

      <div className="detail-section">
        <div className="section-label">로그인 수단</div>
        <div className="chips">
          {selected.identities.map((identity) => (
            <div className="chip" key={`${identity.provider}-${identity.providerUserId}`}>
              {identity.provider}
              <span className="dim mono" style={{ fontSize: 11 }}>{identity.providerUserId.slice(0, 10)}</span>
            </div>
          ))}
          {selected.identities.length === 0 && <span className="dim" style={{ fontSize: 12.5 }}>연결된 Provider 없음</span>}
        </div>
      </div>

      <div className="detail-section">
        <div className="section-label">회원 자격</div>
        {selected.memberships.map((membership) => (
          <div className="membership-row" key={membership.clientId}>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{membership.clientName}</div>
              <div className="dim mono" style={{ fontSize: 11 }}>{membership.clientId}</div>
            </div>
            <select
              className="select"
              aria-label={`${membership.clientName} 상태`}
              value={membership.status}
              onChange={(event) => onMembership(membership, { status: event.target.value })}
            >
              <option value="active">active</option>
              <option value="suspended">suspended</option>
            </select>
            <select
              className="select"
              aria-label={`${membership.clientName} 역할`}
              value={membership.role}
              onChange={(event) => onMembership(membership, { role: event.target.value })}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </div>
        ))}
        {selected.memberships.length === 0 && <span className="dim" style={{ fontSize: 12.5 }}>회원 자격 없음</span>}
      </div>

      <div className="detail-section" style={{ display: 'grid', gap: 7 }}>
        <button className="btn btn--block" onClick={onRevoke}>모든 세션 폐기</button>
      </div>
    </div>
  );
}
