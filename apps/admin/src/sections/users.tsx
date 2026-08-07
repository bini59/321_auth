// apps/admin/src/sections/users.tsx
import { useMemo, useState } from 'react';
import type { AdminMembership, AdminUser, AdminUserDetail } from '../api';
import { CloseIcon, SearchIcon } from '../icons';

type SortKey = 'name' | 'memberships' | 'created';
const initials = (name: string | null) => (name || '?').slice(0, 2);

export function UsersSection({
  users, selected, search, loading, onSearch, onOpen, onCloseDetail, onMembership, onRevoke,
}: {
  users: AdminUser[];
  selected: AdminUserDetail | null;
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onOpen: (user: AdminUser) => void;
  onCloseDetail: () => void;
  onMembership: (membership: AdminMembership, update: { role?: string; status?: string }) => void;
  onRevoke: () => void;
}) {
  const [sort, setSort] = useState<SortKey>('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const sign = dir === 'asc' ? 1 : -1;
    return [...users].sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '') * sign;
      if (sort === 'memberships') return (a.membershipCount - b.membershipCount) * sign;
      return a.createdAt.localeCompare(b.createdAt) * sign;
    });
  }, [users, sort, dir]);

  const toggleSort = (key: SortKey) => {
    if (key === sort) setDir(dir === 'desc' ? 'asc' : 'desc');
    else { setSort(key); setDir('desc'); }
  };
  const mark = (key: SortKey) => (sort === key ? (dir === 'desc' ? ' ↓' : ' ↑') : '');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>사용자</h1>
          <p>프로바이더 인증이 매핑된 전역 인물 목록입니다.</p>
        </div>
        <span className="dim" style={{ fontSize: 12.5 }}>{users.length}명</span>
      </div>

      <div className="toolbar">
        <div className="search">
          <SearchIcon />
          <input
            className="input input--search"
            aria-label="사용자 검색"
            placeholder="이름, 이메일 또는 ID 검색"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>

      <div className={selected ? 'users-layout with-detail' : 'users-layout'}>
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('name')}>사용자{mark('name')}</th>
                  <th>프로바이더</th>
                  <th className="sortable" onClick={() => toggleSort('memberships')}>멤버십{mark('memberships')}</th>
                  <th className="sortable" onClick={() => toggleSort('created')}>가입일{mark('created')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((user) => (
                  <tr
                    key={user.userId}
                    className={selected?.userId === user.userId ? 'clickable selected' : 'clickable'}
                    onClick={() => onOpen(user)}
                  >
                    <td>
                      <div className="cell-main">
                        <div className="avatar avatar--sm">{initials(user.name)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="truncate" style={{ fontWeight: 500 }}>{user.name || '(이름 없음)'}</div>
                          <div className="dim truncate" style={{ fontSize: 11.5 }}>{user.email || '이메일 없음'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{user.providerCount}</td>
                    <td className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{user.membershipCount}</td>
                    <td className="dim mono" style={{ fontSize: 12.5 }}>{user.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && users.length === 0 && (
            <div className="empty">
              <div className="empty-mark"><SearchIcon size={17} /></div>
              <strong>{search ? '검색 결과가 없습니다' : '사용자가 없습니다'}</strong>
              <p>{search ? '다른 이름, 이메일 또는 사용자 ID로 다시 시도해 보세요.' : '로그인이 발생하면 사용자가 생성됩니다.'}</p>
              {search && <button className="btn" onClick={() => onSearch('')}>검색 초기화</button>}
            </div>
          )}
        </div>

        {selected && (
          <div className="card user-detail">
            <div className="detail-head">
              <div className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(selected.name)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="detail-name">{selected.name || '(이름 없음)'}</div>
                <div className="muted" style={{ fontSize: 12 }}>{selected.email || '이메일 없음'}</div>
                <div className="dim mono" style={{ fontSize: 11, marginTop: 3 }}>{selected.userId}</div>
              </div>
              <button className="icon-btn" onClick={onCloseDetail} aria-label="닫기"><CloseIcon /></button>
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
        )}
      </div>
    </>
  );
}
