// apps/admin/src/sections/operations.tsx
import type { AdminAudit, DeletionQueueItem } from '../api';

export function OperationsSection({ audit, queue }: { audit: AdminAudit[]; queue: DeletionQueueItem[] }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>운영</h1>
          <p>관리 작업 기록과 탈퇴 대기 항목입니다.</p>
        </div>
      </div>

      <div className="ops-layout">
        <div className="card">
          <div className="card-head">
            감사 로그
            <span className="spacer" />
            <span className="dim" style={{ fontSize: 11.5, fontWeight: 400 }}>{audit.length}건</span>
          </div>
          {audit.length === 0 ? (
            <div className="empty">
              <strong>기록이 없습니다</strong>
              <p>관리 작업이 발생하면 여기에 남습니다.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {audit.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ width: '34%' }}><span className="audit-action">{entry.action}</span></td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {entry.userId || 'system'}{entry.clientId ? ` · ${entry.clientId}` : ''}
                      </td>
                      <td className="dim mono right" style={{ fontSize: 12 }}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">탈퇴 대기</div>
          {queue.length === 0 ? (
            <div className="empty">
              <strong>대기 중인 요청 없음</strong>
              <p>탈퇴 요청이 접수되면 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="card-body row-list" style={{ paddingTop: 4 }}>
              {queue.map((item) => (
                <div key={`${item.userId}-${item.requestedAt}`} style={{ display: 'block' }}>
                  <div className="mono" style={{ fontSize: 12.5 }}>{item.userId}</div>
                  <div className="dim" style={{ fontSize: 11.5, marginTop: 5 }}>
                    {new Date(item.requestedAt).toLocaleString()} 요청
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
