import type { CSSProperties } from 'react';

type Size = number | string;

export function Skeleton({ w, h = 12, r, className = '', style }: { w?: Size; h?: Size; r?: Size; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

const Busy = ({ children }: { children: React.ReactNode }) => (
  <div className="skeleton-page" role="status" aria-busy="true" aria-label="불러오는 중">{children}</div>
);

const Head = ({ sub = 260 }: { sub?: number }) => (
  <div className="page-head">
    <div style={{ display: 'grid', gap: 9 }}>
      <Skeleton w={120} h={22} />
      <Skeleton w={sub} h={12} />
    </div>
  </div>
);

const CardHead = ({ w = 90 }: { w?: number }) => (
  <div className="card-head"><Skeleton w={w} h={12} /></div>
);

const Person = () => (
  <div className="cell-main">
    <Skeleton w={24} h={24} r="50%" />
    <div style={{ display: 'grid', gap: 6 }}>
      <Skeleton w={110} h={12} />
      <Skeleton w={150} h={10} />
    </div>
  </div>
);

export function TableRows({ rows = 6, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td><Person /></td>
              {Array.from({ length: cols }, (_, j) => <td key={j}><Skeleton w={j % 2 ? 40 : 70} h={11} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <Busy>
      <Head sub={220} />
      <div className="metrics">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="metric" key={i}>
            <Skeleton w={64} h={11} />
            <Skeleton w={80} h={26} style={{ display: 'block', marginTop: 14 }} />
            <Skeleton w={110} h={10} style={{ display: 'block', marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="two-col">
        <div className="card"><CardHead /><div className="card-body" style={{ display: 'grid', gap: 14 }}><Skeleton h={12} /><Skeleton h={12} /></div></div>
      </div>
    </Busy>
  );
}

export function UsersSkeleton() {
  return (
    <Busy>
      <Head />
      <Skeleton h={34} r={8} />
      <div className="card"><TableRows rows={8} cols={3} /></div>
    </Busy>
  );
}

export function ServicesSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <Busy>
      <Head sub={340} />
      <div className="service-grid">
        {Array.from({ length: cards }, (_, i) => (
          <div className="card service-card" key={i}>
            <div className="cell-main">
              <Skeleton w={36} h={36} r={9} />
              <div style={{ display: 'grid', gap: 7 }}><Skeleton w={110} h={13} /><Skeleton w={150} h={10} /></div>
            </div>
            <Skeleton h={11} w="80%" />
            <div className="cell-main"><Skeleton w={44} h={18} r={20} /><Skeleton w={56} h={18} r={20} /></div>
          </div>
        ))}
      </div>
    </Busy>
  );
}

export function ServiceDetailSkeleton() {
  return (
    <Busy>
      <Skeleton w={80} h={12} />
      <div className="card">
        <CardHead w={120} />
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ display: 'grid', gap: 7 }}><Skeleton w={90} h={11} /><Skeleton h={34} r={8} /></div>)}
        </div>
      </div>
    </Busy>
  );
}

export function OperationsSkeleton() {
  return (
    <Busy>
      <Head sub={280} />
      <div className="ops-layout">
        <div className="card"><CardHead /><TableRows rows={6} cols={1} /></div>
        <div className="card"><CardHead /><div className="card-body" style={{ display: 'grid', gap: 16 }}>{[0, 1, 2].map((i) => <div key={i} style={{ display: 'grid', gap: 7 }}><Skeleton w={150} h={12} /><Skeleton w={110} h={10} /></div>)}</div></div>
      </div>
    </Busy>
  );
}

/** 라우트별 스켈레톤을 모르는 곳(router 기본값)에서 쓰는 범용 화면. */
export const PageSkeleton = UsersSkeleton;
