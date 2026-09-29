import { useState, type ReactNode } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useToast } from './toast';

export function QueryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false } }, // 기존 동작 유지: 자동 재시도 없음
    // meta.error가 있는 쿼리는 실패했을 때 토스트로 알린다.
    queryCache: new QueryCache({
      onError: (_error, query) => { if (typeof query.meta?.error === 'string') toast(query.meta.error, 'danger'); },
    }),
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
