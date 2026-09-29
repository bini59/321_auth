import { createFileRoute } from '@tanstack/react-router';
import { useOverview } from '@/api/queries';
import { OverviewView } from '@/components/overview-view';
import { OverviewSkeleton } from '@/components/skeleton';

export const Route = createFileRoute('/_console/')({ component: OverviewPage });

function OverviewPage() {
  const { data, isLoading, isError } = useOverview();
  if (isLoading) return <OverviewSkeleton />;
  return (
    <>
      {isError && <p className="error" role="alert">운영 현황을 불러오지 못했습니다.</p>}
      <OverviewView data={data ?? null} />
    </>
  );
}
