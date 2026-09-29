export function SkeletonPage() {
  return (
    <div className="skeleton-page">
      <div className="skeleton" style={{ height: 20, width: 180, borderRadius: 6 }} />
      <div className="metrics">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
      </div>
      <div className="skeleton" style={{ height: 280 }} />
    </div>
  );
}
