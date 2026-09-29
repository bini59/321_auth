import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useUsers } from '@/api/queries';
import { Avatar } from '@/components/avatar';
import { SearchIcon } from '@/components/icons';
import { UsersSkeleton } from '@/components/skeleton';

const SORTS = ['name', 'memberships', 'created'] as const;
type SortKey = (typeof SORTS)[number];

// 검색·정렬은 URL 이 들고 있어서 새로고침·링크 공유에도 유지된다. 사용자 상세는 /users/$userId.
export const Route = createFileRoute('/_console/users/')({
  validateSearch: (search: Record<string, unknown>): { q?: string; sort?: SortKey; dir?: 'asc' | 'desc' } => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    sort: SORTS.find((key) => key === search.sort),
    dir: search.dir === 'asc' || search.dir === 'desc' ? search.dir : undefined,
  }),
  component: UsersPage,
});

function UsersPage() {
  const { q: search = '', sort = 'created', dir = 'desc' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: { q?: string; sort?: SortKey; dir?: 'asc' | 'desc' }) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const onSearch = (value: string) => setSearch({ q: value || undefined });
  const usersQuery = useUsers(search);

  const users = usersQuery.data ?? [];
  const loading = usersQuery.isPlaceholderData;

  const sorted = useMemo(() => {
    const sign = dir === 'asc' ? 1 : -1;
    return [...users].sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '') * sign;
      if (sort === 'memberships') return (a.membershipCount - b.membershipCount) * sign;
      return a.createdAt.localeCompare(b.createdAt) * sign;
    });
  }, [users, sort, dir]);

  const toggleSort = (key: SortKey) => {
    if (key === sort) setSearch({ dir: dir === 'desc' ? 'asc' : 'desc' });
    else setSearch({ sort: key, dir: 'desc' });
  };
  const mark = (key: SortKey) => (sort === key ? (dir === 'desc' ? ' ↓' : ' ↑') : '');

  if (usersQuery.isLoading) return <UsersSkeleton />;

  return (
    <>
      {usersQuery.isError && <p className="error" role="alert">사용자 목록을 불러오지 못했습니다.</p>}
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
                    className="clickable"
                    onClick={() => void navigate({ to: '/users/$userId', params: { userId: user.userId } })}
                  >
                    <td>
                      <div className="cell-main">
                        <Avatar className="avatar avatar--sm" name={user.name} url={user.avatarUrl} />
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
    </>
  );
}
